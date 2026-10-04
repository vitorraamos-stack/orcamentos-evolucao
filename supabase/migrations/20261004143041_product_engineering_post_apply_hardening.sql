-- Harden privileges and RLS performance for Product Engineering tables created by the foundation migration.

revoke all privileges on table public.products from authenticated;
revoke all privileges on table public.product_versions from authenticated;
revoke all privileges on table public.product_inputs from authenticated;
revoke all privileges on table public.product_variables from authenticated;
revoke all privileges on table public.product_components from authenticated;

grant select, insert, update on table public.products to authenticated;
grant select, insert, update, delete on table public.product_versions to authenticated;
grant select, insert, update, delete on table public.product_inputs to authenticated;
grant select, insert, update, delete on table public.product_variables to authenticated;
grant select, insert, update, delete on table public.product_components to authenticated;

drop policy product_versions_manager_all on public.product_versions;
create policy product_versions_manager_all on public.product_versions
for all to authenticated
using (public.is_manager((select auth.uid())))
with check (public.is_manager((select auth.uid())));

drop policy product_inputs_manager_all on public.product_inputs;
create policy product_inputs_manager_all on public.product_inputs
for all to authenticated
using (public.is_manager((select auth.uid())))
with check (public.is_manager((select auth.uid())));

drop policy product_variables_manager_all on public.product_variables;
create policy product_variables_manager_all on public.product_variables
for all to authenticated
using (public.is_manager((select auth.uid())))
with check (public.is_manager((select auth.uid())));

drop policy product_components_manager_all on public.product_components;
create policy product_components_manager_all on public.product_components
for all to authenticated
using (public.is_manager((select auth.uid())))
with check (public.is_manager((select auth.uid())));

create index product_versions_created_by_idx
  on public.product_versions (created_by);

create index product_versions_published_by_idx
  on public.product_versions (published_by)
  where published_by is not null;
