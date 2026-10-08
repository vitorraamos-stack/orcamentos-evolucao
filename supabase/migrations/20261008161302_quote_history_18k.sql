create function public.quote_history_secure(
  p_quote_id uuid,
  p_actor_id uuid,
  p_is_manager boolean
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  select q.created_by
  into v_owner
  from public.quotes q
  where q.id = p_quote_id;

  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  if not coalesce(p_is_manager, false)
    and v_owner is distinct from p_actor_id then
    raise exception 'QUOTE_FORBIDDEN';
  end if;

  return jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_id', h.id,
            'event_type', h.event_type,
            'occurred_at', h.occurred_at,
            'actor_id', h.actor_id,
            'actor_email', h.actor_email,
            'snapshot_version', h.version_number,
            'pricing_mode',
              case
                when h.negotiation_private_snapshot is null then 'OFFICIAL'
                when h.negotiation_private_snapshot->>'mode' = 'OFFICIAL'
                  then 'OFFICIAL'
                when h.negotiation_private_snapshot->>'mode' = 'MANAGER_FINAL_PRICE'
                  then 'MANAGER_ADJUSTED'
                else 'INVALID'
              end,
            'total_selling_price', h.total_selling_price::text,
            'from_status',
              case
                when h.event_type <> 'STATUS_CHANGED' then null
                when h.payload->>'from' in (
                  'DRAFT','SENT','ACCEPTED','REJECTED','CANCELLED'
                ) then h.payload->>'from'
                else 'INVALID'
              end,
            'to_status',
              case
                when h.event_type <> 'STATUS_CHANGED' then null
                when h.payload->>'to' in (
                  'DRAFT','SENT','ACCEPTED','REJECTED','CANCELLED'
                ) then h.payload->>'to'
                else 'INVALID'
              end
          )
          order by h.occurred_at desc, h.id desc
        )
        from (
          select
            e.id,
            e.event_type,
            e.occurred_at,
            e.actor_id,
            e.payload,
            pr.email as actor_email,
            s.version_number,
            s.negotiation_private_snapshot,
            s.total_selling_price
          from public.quote_events e
          join public.quote_snapshots s
            on s.id = e.snapshot_id
           and s.quote_id = e.quote_id
          join public.profiles pr
            on pr.id = e.actor_id
          where e.quote_id = p_quote_id
          order by e.occurred_at desc, e.id desc
          limit 200
        ) h
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.quote_history_secure(
  uuid,uuid,boolean
) from public,anon,authenticated,service_role;

grant execute on function public.quote_history_secure(
  uuid,uuid,boolean
) to service_role;
