-- EvoluSystem | Biblioteca de Produtos - etapa 1
-- Migration para revisão em PR. NÃO aplicar diretamente em produção sem homologar segurança.
-- Separa rascunhos privados das publicações comerciais, sem reutilizar public.products de custos.

insert into public.app_modules (module_key,label,route_prefixes)
values ('biblioteca_produtos','Biblioteca de Produtos','["/biblioteca"]'::jsonb)
on conflict (module_key) do update set label=excluded.label,route_prefixes=excluded.route_prefixes;

insert into public.user_module_access(user_id,module_key)
select id,'biblioteca_produtos'
from public.profiles
where role in ('admin','gerente','consultor_vendas')
on conflict do nothing;

create table public.library_products (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  draft jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision>0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_version integer not null default 0 check (published_version>=0),
  published_revision integer not null default 0 check (published_revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_draft_object check (jsonb_typeof(draft)='object'),
  constraint library_draft_size check (pg_column_size(draft)<=262144)
);

create table public.library_publications (
  product_id uuid primary key references public.library_products(id) on delete restrict,
  version integer not null check (version>0),
  content jsonb not null check (jsonb_typeof(content)='object'),
  published_at timestamptz not null,
  published_by uuid not null references auth.users(id)
);

create table public.library_product_history (
  product_id uuid not null references public.library_products(id) on delete restrict,
  version integer not null check (version>0),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  published_at timestamptz not null,
  published_by uuid not null references auth.users(id),
  primary key (product_id,version)
);

create index library_products_status_idx on public.library_products(status,updated_at desc);
create index library_publications_recent_idx on public.library_publications(published_at desc);

create function public.library_products_touch_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.draft is distinct from old.draft then
    new.revision := old.revision+1;
  else
    new.revision := old.revision;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger library_products_revision_trigger
before update on public.library_products
for each row execute function public.library_products_touch_revision();

alter table public.library_products enable row level security;
alter table public.library_publications enable row level security;
alter table public.library_product_history enable row level security;

revoke all on public.library_products,public.library_publications,public.library_product_history
from public,anon,authenticated;

grant select,insert,update(draft) on public.library_products to authenticated;
grant select on public.library_publications,public.library_product_history to authenticated;

create policy library_products_manager_select on public.library_products
for select to authenticated
using (public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos'));

create policy library_products_manager_insert on public.library_products
for insert to authenticated
with check (created_by=(select auth.uid())
 and status='draft' and published_version=0 and published_revision=0 and revision=1
 and public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos'));

create policy library_products_manager_update on public.library_products
for update to authenticated
using (public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos')
 and status<>'archived')
with check (public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos'));

create policy library_publications_commercial_select on public.library_publications
for select to authenticated
using (public.has_module_access((select auth.uid()),'biblioteca_produtos')
 and (public.is_manager((select auth.uid()))
   or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='consultor_vendas')));

create policy library_history_manager_select on public.library_product_history
for select to authenticated
using (public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos'));

-- Publica somente os campos comerciais de uma fotografia imutável do rascunho.
-- Campos privados como internal_guidance, internal_tasks e notes nunca são expostos.
create function public.library_publish_product(p_product_id uuid,p_expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_product public.library_products%rowtype;
  v_content jsonb;
  v_gallery jsonb;
  v_complements jsonb;
  v_fields jsonb;
  v_version integer;
  v_published_at timestamptz;
begin
  if auth.uid() is null or not public.is_manager(auth.uid())
     or not public.has_module_access(auth.uid(),'biblioteca_produtos') then
    raise exception 'Sem permissão para publicar produtos.' using errcode='42501';
  end if;

  select * into v_product from public.library_products
  where id=p_product_id for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode='P0002';
  end if;
  if v_product.status='archived' then
    raise exception 'Produtos arquivados devem ser restaurados antes da publicação.' using errcode='22023';
  end if;
  if p_expected_revision is null or v_product.revision<>p_expected_revision then
    raise exception 'A ficha foi alterada por outra pessoa. Atualize antes de publicar.' using errcode='40001';
  end if;
  if length(btrim(coalesce(v_product.draft->>'name','')))<3
     or length(btrim(coalesce(v_product.draft->>'category','')))=0
     or length(btrim(coalesce(v_product.draft->>'description','')))<5 then
    raise exception 'Preencha nome, categoria e descrição antes da publicação.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(v_product.draft->'gallery','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(v_product.draft->'fields','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(v_product.draft->'complements','[]'::jsonb))<>'array' then
    raise exception 'Galeria, campos e complementos devem ser listas.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where jsonb_typeof(f.value)<>'object'
       or length(btrim(coalesce(f.value->>'id','')))=0
       or length(btrim(coalesce(f.value->>'label','')))=0
       or coalesce(f.value->>'type','') not in
          ('text','number','dimensions','select','multi','yesno','attachment')
       or coalesce(f.value->>'when','') not in ('always','paint','install','noart')
       or jsonb_typeof(f.value->'required') is distinct from 'boolean'
       or (f.value->>'type' in ('select','multi')
           and jsonb_typeof(f.value->'options') is distinct from 'array')
       or (f.value->>'type'='attachment' and f.value->>'required'='true')
  ) then
    raise exception 'Há campos inválidos ou ainda não suportados na configuração.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'gallery','[]'::jsonb)) as g(value)
    where g.value->>'visibility'='consultor'
      and (g.value->>'url' is null or g.value->>'url' !~* '^https://')
  ) then
    raise exception 'Imagens comerciais precisam de uma URL HTTPS.' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.value->>'id','title',entry.value->>'title',
    'url',entry.value->>'url','caption',entry.value->>'caption',
    'kind',entry.value->>'kind') order by entry.ordinality),'[]'::jsonb)
  into v_gallery
  from jsonb_array_elements(coalesce(v_product.draft->'gallery','[]'::jsonb))
  with ordinality as entry(value,ordinality)
  where entry.value->>'visibility'='consultor';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.value->>'id','name',entry.value->>'name',
    'mode',entry.value->>'mode','when',entry.value->>'when')
    order by entry.ordinality),'[]'::jsonb)
  into v_complements
  from jsonb_array_elements(coalesce(v_product.draft->'complements','[]'::jsonb))
  with ordinality as entry(value,ordinality)
  where entry.value->>'visibility'='commercial';

  -- Campos do formulário são sanitizados com uma lista positiva de propriedades.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.value->>'id','label',entry.value->>'label',
    'type',entry.value->>'type','required',entry.value->'required',
    'when',entry.value->>'when','options',entry.value->'options',
    'help',entry.value->>'help','unit',entry.value->>'unit')
    order by entry.ordinality),'[]'::jsonb)
  into v_fields
  from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb))
  with ordinality as entry(value,ordinality)
  where coalesce(entry.value->>'visibility','consultor')='consultor';

  v_content:=jsonb_build_object(
    'name',v_product.draft->>'name',
    'category',v_product.draft->>'category',
    'description',v_product.draft->>'description',
    'applications',coalesce(v_product.draft->>'applications',''),
    'gallery',v_gallery,
    'fields',v_fields,
    'complements',v_complements,
    'guidance',coalesce(v_product.draft->>'consultant_guidance','')
  );

  v_version:=v_product.published_version+1;
  v_published_at:=now();
  insert into public.library_product_history(product_id,version,snapshot,published_at,published_by)
  values(p_product_id,v_version,v_product.draft,v_published_at,auth.uid());

  insert into public.library_publications(product_id,version,content,published_at,published_by)
  values(p_product_id,v_version,v_content,v_published_at,auth.uid())
  on conflict (product_id) do update
  set version=excluded.version,content=excluded.content,
      published_at=excluded.published_at,published_by=excluded.published_by;

  update public.library_products
  set status='published',published_version=v_version,published_revision=v_product.revision
  where id=p_product_id;
  return v_version;
end;
$$;

create function public.library_archive_product(p_product_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_manager(auth.uid())
     or not public.has_module_access(auth.uid(),'biblioteca_produtos') then
    raise exception 'Sem permissão para arquivar produtos.' using errcode='42501';
  end if;
  perform 1 from public.library_products where id=p_product_id for update;
  if not found then raise exception 'Produto não encontrado.' using errcode='P0002'; end if;
  delete from public.library_publications where product_id=p_product_id;
  update public.library_products set status='archived' where id=p_product_id;
end;
$$;

create function public.library_restore_product(p_product_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_manager(auth.uid())
     or not public.has_module_access(auth.uid(),'biblioteca_produtos') then
    raise exception 'Sem permissão para restaurar produtos.' using errcode='42501';
  end if;
  update public.library_products set status='draft'
  where id=p_product_id and status='archived';
  if not found then raise exception 'Produto não encontrado ou não arquivado.' using errcode='P0002'; end if;
  -- Restauração não republica; exige nova publicação deliberada.
end;
$$;

revoke all on function public.library_publish_product(uuid,integer) from public,anon;
revoke all on function public.library_archive_product(uuid) from public,anon;
revoke all on function public.library_restore_product(uuid) from public,anon;
grant execute on function public.library_publish_product(uuid,integer) to authenticated;
grant execute on function public.library_archive_product(uuid) to authenticated;
grant execute on function public.library_restore_product(uuid) to authenticated;
