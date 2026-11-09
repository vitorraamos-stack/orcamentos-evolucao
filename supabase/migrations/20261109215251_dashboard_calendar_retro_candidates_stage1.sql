-- EvoluSystem / Dashboard Etapa 1 — seleção completa e limitada de OS candidatas.
-- PROPOSTA NÃO APLICADA. RPC SOMENTE LEITURA; sem aprovar/corrigir históricos.
CREATE FUNCTION public.dashboard_list_calendar_retro_candidate_orders(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_request public.dashboard_calendar_retro_review_requests;
  v_begin timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
  v_count integer;
  v_ids jsonb;
BEGIN
  PERFORM public.dashboard_assert_manager();
  SELECT * INTO v_request
    FROM public.dashboard_calendar_retro_review_requests
    WHERE id=p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação histórica não encontrada' USING ERRCODE='22023';
  END IF;
  -- Revalida vigência histórica; jamais usa uma versão antiga superada.
  PERFORM public.dashboard_preview_calendar_retro_request(
    v_request.calendar_version_id,v_request.exception_date
  );
  v_begin := v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_end := (v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT count(DISTINCT si.order_id)::integer INTO v_count
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at<v_end AND coalesce(si.left_at,v_now)>v_begin;
  IF v_count>300 THEN
    RAISE EXCEPTION 'Mais de 300 OS candidatas. A simulação por OS está bloqueada para impedir leitura parcial.'
      USING ERRCODE='54000';
  END IF;
  SELECT coalesce(jsonb_agg(order_id ORDER BY order_id),'[]'::jsonb) INTO v_ids
    FROM (
      SELECT DISTINCT si.order_id::text AS order_id
      FROM public.dashboard_stage_intervals si
      WHERE si.entered_at<v_end AND coalesce(si.left_at,v_now)>v_begin
    ) s;
  IF jsonb_array_length(v_ids)<>v_count THEN
    RAISE EXCEPTION 'Conjunto de OS mudou durante a consulta. Atualize a prévia.'
      USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object(
    'request_id',v_request.id,
    'as_of',v_now,
    'candidate_order_count',v_count,
    'order_ids',v_ids,
    'read_only',true
  );
END $$;
REVOKE ALL ON FUNCTION public.dashboard_list_calendar_retro_candidate_orders(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_list_calendar_retro_candidate_orders(uuid)
  TO authenticated;
