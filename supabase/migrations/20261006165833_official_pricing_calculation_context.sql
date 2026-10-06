-- 16D Official Pricing calculation context.
-- Adds one server-only, snapshot-consistent read RPC. No commercial data is seeded.

create function public.pricing_get_official_calculation_context_secure(
  p_product_id uuid,
  p_installments integer
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_settings public.product_pricing_settings;
  v_policy public.pricing_policies;
  v_version public.pricing_policy_versions;
  v_payment public.pricing_payment_terms;
  v_payment_json jsonb;
begin
  if p_installments < 1 or p_installments > 12 then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  select * into v_settings
  from public.product_pricing_settings
  where product_id = p_product_id;

  if not found then
    raise exception 'PRODUCT_PRICING_SETTINGS_NOT_FOUND';
  end if;

  select * into v_policy
  from public.pricing_policies
  where id = v_settings.pricing_policy_id;

  if not found then
    raise exception 'PRICING_POLICY_NOT_FOUND';
  end if;

  if v_policy.status <> 'ACTIVE' then
    raise exception 'PRICING_POLICY_NOT_ACTIVE';
  end if;

  select * into v_version
  from public.pricing_policy_versions
  where pricing_policy_id = v_policy.id
    and status = 'PUBLISHED';

  if not found then
    raise exception 'PRICING_PUBLISHED_VERSION_NOT_FOUND';
  end if;

  if p_installments <= 3 then
    v_payment_json := jsonb_build_object(
      'source', 'SYSTEM_ZERO',
      'installments', p_installments,
      'rate', '0',
      'revision', null
    );
  else
    select * into v_payment
    from public.pricing_payment_terms
    where installments = p_installments;

    if not found then
      raise exception 'PRICING_PAYMENT_TERM_NOT_FOUND';
    end if;

    v_payment_json := jsonb_build_object(
      'source', 'CONFIGURED',
      'installments', v_payment.installments,
      'rate', v_payment.rate::text,
      'revision', v_payment.revision
    );
  end if;

  return jsonb_build_object(
    'schema_version', v_version.schema_version,
    'engine_version', v_version.engine_version,
    'policy', jsonb_build_object(
      'id', v_policy.id,
      'code', v_policy.code,
      'name', v_policy.name,
      'description', v_policy.description,
      'status', v_policy.status
    ),
    'version', jsonb_build_object(
      'id', v_version.id,
      'pricing_policy_id', v_version.pricing_policy_id,
      'version_number', v_version.version_number,
      'revision', v_version.revision,
      'status', v_version.status,
      'notes', v_version.notes,
      'created_at', v_version.created_at,
      'created_by', v_version.created_by,
      'published_at', v_version.published_at,
      'published_by', v_version.published_by
    ),
    'strategy_type', v_version.strategy_type,
    'markup', v_version.markup::text,
    'markup_base', v_version.markup_base,
    'charges', '[]'::jsonb,
    'product_settings', jsonb_build_object(
      'product_id', v_settings.product_id,
      'pricing_policy_id', v_settings.pricing_policy_id,
      'minimum_selling_price', v_settings.minimum_selling_price::text,
      'revision', v_settings.revision,
      'updated_at', v_settings.updated_at,
      'updated_by', v_settings.updated_by
    ),
    'payment_term', v_payment_json
  );
end;
$$;

revoke execute on function public.pricing_get_official_calculation_context_secure(uuid,integer)
  from public, anon, authenticated;

grant execute on function public.pricing_get_official_calculation_context_secure(uuid,integer)
  to service_role;
