-- Harden Costing runtime privileges for service_role.
-- The runtime needs only SELECT, INSERT, and UPDATE on these eight tables.

revoke all
on table
  public.material_definitions,
  public.process_definitions,
  public.outsourced_service_definitions,
  public.fixed_cost_definitions,
  public.material_cost_rates,
  public.process_cost_rates,
  public.outsourced_service_cost_rates,
  public.fixed_cost_rates
from service_role;

grant select, insert, update
on table
  public.material_definitions,
  public.process_definitions,
  public.outsourced_service_definitions,
  public.fixed_cost_definitions,
  public.material_cost_rates,
  public.process_cost_rates,
  public.outsourced_service_cost_rates,
  public.fixed_cost_rates
to service_role;

-- Preserve the existing browser-role boundary as defense in depth.
revoke all
on table
  public.material_definitions,
  public.process_definitions,
  public.outsourced_service_definitions,
  public.fixed_cost_definitions,
  public.material_cost_rates,
  public.process_cost_rates,
  public.outsourced_service_cost_rates,
  public.fixed_cost_rates
from public, anon, authenticated;
