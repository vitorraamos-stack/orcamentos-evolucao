-- Biblioteca V28 individual | templates, complementos, storage privado e regras.
-- NUNCA criar projectos/itens multiproduto nesta etapa.

create table if not exists public.library_config_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  fields jsonb not null check (jsonb_typeof(fields)='array' and pg_column_size(fields)<131072),
  version integer not null default 1 check (version>=1),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_complement_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  mode text not null check (mode in ('separate','included','internal')),
  visibility text not null check (visibility in ('commercial','internal')),
  when_condition text not null default 'always' check (when_condition in ('always','install','noart')),
  version integer not null default 1 check (version>=1),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint library_complement_visibility_compatible check (
    (mode='internal' and visibility='internal') or (mode<>'internal' and visibility='commercial')
  )
);

alter table public.library_config_templates enable row level security;
alter table public.library_complement_catalog enable row level security;
revoke all on public.library_config_templates, public.library_complement_catalog from public,anon,authenticated;
grant select,insert,update(name,category,fields,version,updated_at),delete on public.library_config_templates to authenticated;
grant select,insert,update(name,mode,visibility,when_condition,version,updated_at),delete on public.library_complement_catalog to authenticated;

create policy library_templates_manager_all on public.library_config_templates
  for all to authenticated
  using (public.is_manager((select auth.uid()))
   and public.has_module_access((select auth.uid()),'biblioteca_produtos'))
  with check (public.is_manager((select auth.uid()))
   and public.has_module_access((select auth.uid()),'biblioteca_produtos')
   and created_by is not null);

create policy library_complements_manager_all on public.library_complement_catalog
  for all to authenticated
  using (public.is_manager((select auth.uid()))
   and public.has_module_access((select auth.uid()),'biblioteca_produtos'))
  with check (public.is_manager((select auth.uid()))
   and public.has_module_access((select auth.uid()),'biblioteca_produtos')
   and created_by is not null);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('library-product-images','library-product-images',false,8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=8388608,
allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy library_images_manager_select on storage.objects
 for select to authenticated using (
 bucket_id='library-product-images'
 and public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos')
);

create policy library_images_manager_insert on storage.objects
 for insert to authenticated with check (
 bucket_id='library-product-images'
 and public.is_manager((select auth.uid()))
 and public.has_module_access((select auth.uid()),'biblioteca_produtos')
 and exists (select 1 from public.library_products lp
   where lp.id::text=split_part(name,'/',1) and lp.status<>'archived')
);

create policy library_images_consultant_select on storage.objects
 for select to authenticated using (
 bucket_id='library-product-images'
 and public.has_module_access((select auth.uid()),'biblioteca_produtos')
 and exists (
  select 1 from public.library_publications lp
  where lp.product_id::text=split_part(name,'/',1)
   and exists (
    select 1 from jsonb_array_elements(lp.content->'gallery') as img(value)
    where img.value->>'url'='storage://library-product-images/'||name
   )
 )
);

-- O URL persistido é um ponteiro estável, NUNCA um link assinado temporário.
-- Apenas imagens presentes na ficha publicada podem ser assinadas pelos consultores.
create or replace function public.library_publish_product(p_product_id uuid,p_expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_product public.library_products%rowtype;
  v_content jsonb;
  v_gallery jsonb;
  v_complements jsonb;
  v_fields jsonb;
  v_conditions jsonb;
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
  if v_product.status='published' and v_product.revision=v_product.published_revision then
    raise exception 'Não existem alterações novas para publicar.' using errcode='22023';
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
      and (g.value->>'url' is null or (g.value->>'url' !~* '^https://' and g.value->>'url' !~ '^storage://library-product-images/[0-9a-f-]{36}/[0-9a-zA-Z_.-]+
  ) then
    raise exception 'Imagens comerciais precisam de uma URL HTTPS.' using errcode='22023';
  end if;


  -- Falha fechada: nenhum campo dependente pode ser publicado sem seu controlador
  -- comercial. A aplicação da condição é validada novamente no servidor.
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where coalesce(f.value->>'visibility','consultor')='consultor'
      and f.value->>'when' in ('paint','install','noart')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as controller(value)
        where controller.value->>'id'=case f.value->>'when'
          when 'paint' then 'acabamento'
          when 'install' then 'instalacao'
          when 'noart' then 'arte_vetorial'
        end
        and coalesce(controller.value->>'visibility','consultor')='consultor'
        and controller.value->>'type'=case f.value->>'when'
          when 'paint' then 'select' else 'yesno'
        end
      )
  ) then
    raise exception 'Existe campo condicional sem controlador comercial válido.' using errcode='22023';
  end if;

  -- As exigências centrais da V28 nunca podem ser dispensadas apenas
  -- por editar o formulário no navegador.
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='instalacao'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) and not exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='superficie'
      and f.value->>'when'='install' and f.value->>'required'='true'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) then
    raise exception 'Instalação exige campo de superfície obrigatório.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='acabamento'
      and f.value->>'type'='select'
      and coalesce(f.value->>'visibility','consultor')='consultor'
      and exists (
        select 1 from jsonb_array_elements_text(coalesce(f.value->'options','[]'::jsonb)) as option_text(value)
        where lower(option_text.value) like '%pintura%'
      )
  ) and not exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='cor'
      and f.value->>'when'='paint' and f.value->>'required'='true'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) then
    raise exception 'Acabamento com pintura exige campo de cor obrigatório.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'complements','[]'::jsonb)) as c(value)
    where jsonb_typeof(c.value)<>'object'
      or coalesce(c.value->>'visibility','') not in ('commercial','internal')
      or coalesce(c.value->>'mode','') not in ('separate','included','internal')
      or (c.value->>'visibility'='commercial' and c.value->>'mode'='internal')
      or (c.value->>'visibility'='internal' and c.value->>'mode'<>'internal')
      or coalesce(c.value->>'when','') not in ('always','install','noart')
      or length(btrim(coalesce(c.value->>'name','')))=0
  ) then
    raise exception 'Há complementos inválidos ou com visibilidade incompatível.' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.value->>'id','title',entry.value->>'title',
    'url',entry.value->>'url','caption',entry.value->>'caption',
    'kind',entry.value->>'kind',
    'cover',coalesce((entry.value->>'cover')::boolean,false)) order by entry.ordinality),'[]'::jsonb)
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

  if coalesce(v_product.draft->'rules'->>'photos_policy','recommend')
     not in ('recommend','required','waive') then
    raise exception 'Política de fotografias inválida.' using errcode='22023';
  end if;
  if v_product.draft->'rules'->>'photos_policy'='waive'
     and length(btrim(coalesce(v_product.draft->'rules'->>'waiver_reason','')))<10 then
    raise exception 'Justificativa obrigatória para dispensar fotografias.' using errcode='22023';
  end if;

  if jsonb_typeof(coalesce(v_product.draft->'rules'->'conditions','[]'::jsonb))<>'array' then
    raise exception 'Lista de regras inválida.' using errcode='22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_product.draft->'rules'->'conditions','[]'::jsonb)) as r(value)
    where jsonb_typeof(r.value)<>'object'
       or coalesce(r.value->>'action','') not in ('note','require_photos','technical_review')
       or length(btrim(coalesce(r.value->>'field','')))=0
       or length(btrim(coalesce(r.value->>'equals','')))=0
       or (r.value->>'action'='note' and length(btrim(coalesce(r.value->>'message','')))=0)
       or not exists (
         select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
         where f.value->>'id'=r.value->>'field'
           and coalesce(f.value->>'visibility','consultor')='consultor'
           and (
             (f.value->>'type'='yesno' and r.value->>'equals' in ('Sim','Não'))
             or (f.value->>'type'='select' and f.value->'options' ? (r.value->>'equals'))
           )
       )
  ) then
    raise exception 'Regra condicional possui campo, opção ou ação inválidos.' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.value->>'id','field',r.value->>'field',
    'equals',r.value->>'equals','action',r.value->>'action',
    'message',r.value->>'message'
  ) order by r.ordinality),'[]'::jsonb)
  into v_conditions
  from jsonb_array_elements(coalesce(v_product.draft->'rules'->'conditions','[]'::jsonb))
    with ordinality as r(value,ordinality);

  v_content:=jsonb_build_object(
    'name',v_product.draft->>'name',
    'category',v_product.draft->>'category',
    'description',v_product.draft->>'description',
    'applications',coalesce(v_product.draft->>'applications',''),
    'gallery',v_gallery,
    'fields',v_fields,
    'complements',v_complements,
    'guidance',coalesce(v_product.draft->>'consultant_guidance',''),
    'rules',jsonb_build_object(
      'photos_policy',coalesce(v_product.draft->'rules'->>'photos_policy','recommend'),
      'special_fixing_review',true,
      'conditions',v_conditions
    )
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
$$;))
  ) then
    raise exception 'Imagens comerciais precisam de uma URL HTTPS.' using errcode='22023';
  end if;


  -- Falha fechada: nenhum campo dependente pode ser publicado sem seu controlador
  -- comercial. A aplicação da condição é validada novamente no servidor.
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where coalesce(f.value->>'visibility','consultor')='consultor'
      and f.value->>'when' in ('paint','install','noart')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as controller(value)
        where controller.value->>'id'=case f.value->>'when'
          when 'paint' then 'acabamento'
          when 'install' then 'instalacao'
          when 'noart' then 'arte_vetorial'
        end
        and coalesce(controller.value->>'visibility','consultor')='consultor'
        and controller.value->>'type'=case f.value->>'when'
          when 'paint' then 'select' else 'yesno'
        end
      )
  ) then
    raise exception 'Existe campo condicional sem controlador comercial válido.' using errcode='22023';
  end if;

  -- As exigências centrais da V28 nunca podem ser dispensadas apenas
  -- por editar o formulário no navegador.
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='instalacao'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) and not exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='superficie'
      and f.value->>'when'='install' and f.value->>'required'='true'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) then
    raise exception 'Instalação exige campo de superfície obrigatório.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='acabamento'
      and f.value->>'type'='select'
      and coalesce(f.value->>'visibility','consultor')='consultor'
      and exists (
        select 1 from jsonb_array_elements_text(coalesce(f.value->'options','[]'::jsonb)) as option_text(value)
        where lower(option_text.value) like '%pintura%'
      )
  ) and not exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'fields','[]'::jsonb)) as f(value)
    where f.value->>'id'='cor'
      and f.value->>'when'='paint' and f.value->>'required'='true'
      and coalesce(f.value->>'visibility','consultor')='consultor'
  ) then
    raise exception 'Acabamento com pintura exige campo de cor obrigatório.' using errcode='22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_product.draft->'complements','[]'::jsonb)) as c(value)
    where jsonb_typeof(c.value)<>'object'
      or coalesce(c.value->>'visibility','') not in ('commercial','internal')
      or coalesce(c.value->>'mode','') not in ('separate','included','internal')
      or (c.value->>'visibility'='commercial' and c.value->>'mode'='internal')
      or (c.value->>'visibility'='internal' and c.value->>'mode'<>'internal')
      or coalesce(c.value->>'when','') not in ('always','install','noart')
      or length(btrim(coalesce(c.value->>'name','')))=0
  ) then
    raise exception 'Há complementos inválidos ou com visibilidade incompatível.' using errcode='22023';
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
