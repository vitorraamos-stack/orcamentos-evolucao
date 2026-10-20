-- EvoluSystem | PR 31A: vínculo canônico entre Engenharia e Biblioteca.
-- Migration aditiva, SEM associação automática de produtos existentes.
-- Não aplicar em produção sem autorização específica.
create table public.product_commercial_links (
  product_id uuid primary key
    references public.products(id) on delete restrict,
  library_product_id uuid not null unique
    references public.library_products(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null
    references auth.users(id) on delete restrict
);

comment on table public.product_commercial_links is
  'Associação administrativa 1:1 entre produto técnico e ficha da Biblioteca; não contém precificação.';
comment on column public.product_commercial_links.created_by is
  'Usuário autenticado validado pelo serviço administrativo, nunca informado pelo navegador.';

-- Nenhuma política para papéis do navegador: acesso somente pelo backend autorizado.
alter table public.product_commercial_links enable row level security;
revoke all on table public.product_commercial_links from public, anon, authenticated;
grant select, insert on table public.product_commercial_links to service_role;

-- O backend também precisa validar existência/status sem ler os rascunhos privados.
-- Esta concessão é SOMENTE de colunas, não de SELECT sobre a tabela inteira.
grant select (id, status) on table public.library_products to service_role;

-- Propositalmente sem UPDATE/DELETE, RPC exposta, backfill ou alteração de produtos legados.
