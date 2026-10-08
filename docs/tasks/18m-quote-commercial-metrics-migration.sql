-- Canonical production migration:
-- supabase/migrations/20261008172217_quote_commercial_metrics_18m.sql
-- Kept here as the reviewed 18M SQL source.

create function public.quote_commercial_metrics_secure(
  p_actor_id uuid,
  p_is_manager boolean
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
with visible as (
  select
    q.id,
    q.status,
    s.total_selling_price
  from public.quotes q
  join public.quote_snapshots s
    on s.id = q.current_snapshot_id
   and s.quote_id = q.id
  where coalesce(p_is_manager,false)
     or q.created_by = p_actor_id
),
counts as (
  select
    count(*)::integer as total_quotes,
    count(*) filter (where status='DRAFT')::integer as draft_quotes,
    count(*) filter (where status='SENT')::integer as sent_quotes,
    count(*) filter (where status in ('DRAFT','SENT'))::integer as open_quotes,
    count(*) filter (where status='ACCEPTED')::integer as accepted_quotes,
    count(*) filter (where status='REJECTED')::integer as rejected_quotes,
    count(*) filter (where status='CANCELLED')::integer as cancelled_quotes,
    count(*) filter (where status in ('ACCEPTED','REJECTED'))::integer as decided_quotes,
    round(
      coalesce(sum(total_selling_price) filter (where status='ACCEPTED'),0),
      2
    ) as accepted_value
  from visible
),
rejected_events as (
  select
    v.id,
    case
      when e.reason_code in (
        'PRICE','DEADLINE','COMPETITOR','NO_RESPONSE','CLIENT_CANCELLED','OTHER'
      ) then e.reason_code
      else null
    end as reason_code
  from visible v
  left join lateral (
    select ev.payload->>'reason_code' as reason_code
    from public.quote_events ev
    where ev.quote_id = v.id
      and ev.event_type = 'STATUS_CHANGED'
      and ev.payload->>'to' = 'REJECTED'
    order by ev.occurred_at desc, ev.id desc
    limit 1
  ) e on true
  where v.status='REJECTED'
),
loss_grouped as (
  select reason_code as code, count(*)::integer as count
  from rejected_events
  where reason_code is not null
  group by reason_code
),
loss_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('code',code,'count',count)
      order by count desc, code asc
    ),
    '[]'::jsonb
  ) as loss_reasons
  from loss_grouped
)
select jsonb_build_object(
  'total_quotes', c.total_quotes,
  'draft_quotes', c.draft_quotes,
  'sent_quotes', c.sent_quotes,
  'open_quotes', c.open_quotes,
  'accepted_quotes', c.accepted_quotes,
  'rejected_quotes', c.rejected_quotes,
  'cancelled_quotes', c.cancelled_quotes,
  'decided_quotes', c.decided_quotes,
  'conversion_bps',
    case
      when c.decided_quotes = 0 then 0
      else round(c.accepted_quotes::numeric * 10000 / c.decided_quotes)::integer
    end,
  'accepted_value', c.accepted_value::text,
  'rejected_without_reason',
    (select count(*)::integer from rejected_events where reason_code is null),
  'loss_reasons', l.loss_reasons
)
from counts c
cross join loss_json l;
$$;

revoke all on function public.quote_commercial_metrics_secure(
  uuid,boolean
) from public,anon,authenticated,service_role;

grant execute on function public.quote_commercial_metrics_secure(
  uuid,boolean
) to service_role;
