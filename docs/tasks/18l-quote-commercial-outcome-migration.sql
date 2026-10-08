-- 18L draft. Apply through Supabase only after explicit production authorization.
-- Final migration filename must be reconciled to the timestamp recorded remotely.

create function public.quote_transition_status_v2_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_target_status text,
  p_actor_id uuid,
  p_is_manager boolean,
  p_reason_code text,
  p_reason_note text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.quotes;
  v_after public.quotes;
  v_reason_note text := nullif(btrim(p_reason_note), '');
begin
  select * into v_before
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if not coalesce(p_is_manager,false)
    and v_before.created_by is distinct from p_actor_id then
    raise exception 'QUOTE_FORBIDDEN';
  end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'QUOTE_REVISION_CONFLICT';
  end if;

  if v_reason_note is not null and char_length(v_reason_note) > 300 then
    raise exception 'INVALID_QUOTE_CONFIGURATION';
  end if;

  if p_target_status = 'REJECTED' then
    if p_reason_code is null
      or p_reason_code not in (
        'PRICE','DEADLINE','COMPETITOR','NO_RESPONSE',
        'CLIENT_CANCELLED','OTHER'
      ) then
      raise exception 'INVALID_QUOTE_CONFIGURATION';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if p_reason_code is null
      or p_reason_code not in (
        'DUPLICATE','CREATED_BY_MISTAKE','SCOPE_CHANGED','OTHER'
      ) then
      raise exception 'INVALID_QUOTE_CONFIGURATION';
    end if;
  elsif p_reason_code is not null or v_reason_note is not null then
    raise exception 'INVALID_QUOTE_CONFIGURATION';
  end if;

  if p_reason_code = 'OTHER'
    and (v_reason_note is null or char_length(v_reason_note) < 5) then
    raise exception 'INVALID_QUOTE_CONFIGURATION';
  end if;

  update public.quotes
  set status=p_target_status,
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_after;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_after.current_snapshot_id,'STATUS_CHANGED',p_actor_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'from',v_before.status,
        'to',v_after.status,
        'quote_revision',v_after.revision,
        'reason_code',p_reason_code,
        'reason_note',v_reason_note
      )
    )
  );

  return jsonb_build_object(
    'quote_id',v_after.id,
    'quote_number',v_after.quote_number,
    'status',v_after.status,
    'revision',v_after.revision,
    'snapshot_id',v_after.current_snapshot_id,
    'updated_at',v_after.updated_at
  );
end;
$$;

revoke all on function public.quote_transition_status_v2_secure(
  uuid,integer,text,uuid,boolean,text,text
) from public,anon,authenticated,service_role;

grant execute on function public.quote_transition_status_v2_secure(
  uuid,integer,text,uuid,boolean,text,text
) to service_role;

create or replace function public.quote_history_secure(
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
              end,
            'outcome_reason_code',
              case
                when h.event_type <> 'STATUS_CHANGED' then null
                when h.payload->>'to' not in ('REJECTED','CANCELLED') then null
                when h.payload ? 'reason_code' then h.payload->>'reason_code'
                else null
              end,
            'outcome_reason_note',
              case
                when h.event_type <> 'STATUS_CHANGED' then null
                when h.payload->>'to' not in ('REJECTED','CANCELLED') then null
                when h.payload ? 'reason_note' then h.payload->>'reason_note'
                else null
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
