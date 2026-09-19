-- Fase 1.1: aggregate the complete RLS-visible operational stock in one query.
-- SECURITY INVOKER is intentional: os_orders RLS remains the authorization boundary.
create or replace function public.get_operational_dashboard_metrics(
  p_today date,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_orders as (
    select
      o.*,
      (coalesce(o.archived, false) or lower(coalesce(o.prod_status, '')) like '%finaliz%') as finished,
      (
        o.delivery_date is not null
        and (p_period_start is null or o.delivery_date >= p_period_start)
        and (p_period_end is null or o.delivery_date <= p_period_end)
      ) as in_period
    from public.os_orders o
    where public.has_module_access(auth.uid(), 'hub_os')
  )
  select jsonb_build_object(
    'active', count(*) filter (where not finished),
    'art', count(*) filter (where not finished and prod_status is null),
    'approval', count(*) filter (where not finished and lower(art_status) like '%aprovação%'),
    'production', count(*) filter (where not finished and lower(coalesce(prod_status, '')) like '%produção%'),
    'finish', count(*) filter (where not finished and lower(coalesce(prod_status, '')) like '%acabamento%'),
    'ready', count(*) filter (where not finished and (production_tag = 'PRONTO' or lower(coalesce(prod_status, '')) like '%pronto%')),
    'installations', count(*) filter (where not finished and logistic_type = 'instalacao' and in_period),
    'overdue', count(*) filter (where not finished and delivery_date < p_today and in_period),
    'today', count(*) filter (where delivery_date = p_today and in_period),
    'tomorrow', count(*) filter (where delivery_date = p_today + 1 and in_period),
    'letterBox', count(*) filter (where not finished and letra_caixa),
    'externalProduction', count(*) filter (where not finished and production_tag = 'PRODUCAO_EXTERNA'),
    'installationLoad', count(*) filter (where not finished and logistic_type = 'instalacao')
  )
  from visible_orders;
$$;

revoke all on function public.get_operational_dashboard_metrics(date, date, date) from public;
revoke all on function public.get_operational_dashboard_metrics(date, date, date) from anon;
grant execute on function public.get_operational_dashboard_metrics(date, date, date) to authenticated;

comment on function public.get_operational_dashboard_metrics(date, date, date) is
  'Fase 1.1 dashboard aggregate. Current-state metrics ignore period; deadline/logistics metrics require delivery_date in period and obey os_orders RLS.';
