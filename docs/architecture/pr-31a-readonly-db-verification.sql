-- PR 31A | HOMOLOGAÇÃO | CONSULTAS SOMENTE DE LEITURA.
-- Executar apenas APÓS aplicar a migration num banco ISOLADO e autorizado.
-- Não aplica alterações, não cria vínculos nem utiliza dados de clientes.
-- Todos os campos "pass" deverão retornar TRUE.

with checks as (
  select
    to_regclass('public.product_commercial_links') as link_table
)
select
  link_table is not null as table_exists_pass,
  coalesce((
    select c.relrowsecurity
    from pg_class c
    where c.oid = link_table
  ), false) as rls_enabled_pass,
  (select count(*) from pg_policies
   where schemaname = 'public'
     and tablename = 'product_commercial_links') = 0 as no_browser_rls_policy_pass,
  (select count(*) from pg_constraint
   where conrelid = link_table and contype = 'p') = 1 as primary_key_pass,
  (select count(*) from pg_constraint
   where conrelid = link_table and contype = 'u') = 1 as unique_library_product_pass,
  (select count(*) from pg_constraint
   where conrelid = link_table and contype = 'f') = 3 as three_foreign_keys_pass,
  not has_table_privilege('anon',
    'public.product_commercial_links', 'SELECT') as anon_select_blocked_pass,
  not has_table_privilege('authenticated',
    'public.product_commercial_links', 'SELECT') as authenticated_select_blocked_pass,
  not has_table_privilege('authenticated',
    'public.product_commercial_links', 'INSERT') as authenticated_insert_blocked_pass,
  has_table_privilege('service_role',
    'public.product_commercial_links', 'SELECT') as backend_select_pass,
  has_table_privilege('service_role',
    'public.product_commercial_links', 'INSERT') as backend_insert_pass,
  not has_table_privilege('service_role',
    'public.product_commercial_links', 'UPDATE') as backend_update_blocked_pass,
  not has_table_privilege('service_role',
    'public.product_commercial_links', 'DELETE') as backend_delete_blocked_pass,
  has_column_privilege('service_role',
    'public.library_products', 'id', 'SELECT') as library_id_read_pass,
  has_column_privilege('service_role',
    'public.library_products', 'status', 'SELECT') as library_status_read_pass,
  not has_column_privilege('service_role',
    'public.library_products', 'draft', 'SELECT') as library_draft_blocked_pass,
  (select count(*) from public.product_commercial_links) = 0 as no_automatic_link_pass
from checks;
