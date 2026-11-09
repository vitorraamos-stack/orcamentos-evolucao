-- EvoluSystem / Dashboard Operacional — preparação de aprovação retroativa.
-- MIGRATION PROPOSTA, NÃO APLICADA. Não efetua aprovação nem altera datas,
-- exceções, calendários, OS, alertas ou qualquer registro operacional.
-- A simulação JS nunca pode autorizar efeitos históricos no servidor.

CREATE TABLE public.dashboard_calendar_retro_approval_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL
    REFERENCES public.dashboard_calendar_retro_review_requests(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'awaiting_server_verification'
    CHECK (status = 'awaiting_server_verification'),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dashboard_calendar_retro_approval_dossiers_lookup
  ON public.dashboard_calendar_retro_approval_dossiers(request_id,created_at DESC,id DESC);
ALTER TABLE public.dashboard_calendar_retro_approval_dossiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_calendar_retro_approval_dossiers
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.dashboard_calendar_retro_approval_dossiers TO authenticated;
CREATE POLICY dashboard_retro_approval_dossiers_manager_read
  ON public.dashboard_calendar_retro_approval_dossiers
  FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE TRIGGER dashboard_retro_approval_dossiers_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_calendar_retro_approval_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- Independent server preflight. Counts are based on persisted evidence only.
-- Never invent that the collected intervals cover all historical OS. Even if
-- all counts are zero, the absence of pre-instrumentation history is unknown.
CREATE FUNCTION public.dashboard_preview_calendar_retro_approval_preflight(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_request public.dashboard_calendar_retro_review_requests;
  v_summary jsonb;
  v_begin timestamptz;
  v_end timestamptz;
  v_interval_count bigint := 0;
  v_order_count bigint := 0;
  v_unverified_count bigint := 0;
  v_unlinked_count bigint := 0;
  v_pause_count bigint := 0;
  v_invalid_pause_count bigint := 0;
  v_sector_count bigint := 0;
  v_threshold_count bigint := 0;
  v_rejected boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_signature text;
BEGIN
  PERFORM public.dashboard_assert_manager();
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma solicitação histórica' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_request
    FROM public.dashboard_calendar_retro_review_requests
    WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE='22023';
  END IF;

  -- Must still belong to the original, effective global calendar version.
  v_summary := public.dashboard_preview_calendar_retro_review(p_request_id);
  v_rejected := coalesce((v_summary->>'already_rejected')::boolean,false);
  v_begin := v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_end := (v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT count(*), count(DISTINCT si.order_id),
         count(*) FILTER (WHERE si.evidence_state <> 'verified'),
         count(*) FILTER (WHERE si.calendar_version_id IS NULL OR
             si.rule_revision_id IS NULL OR si.entered_at IS NULL OR
             (si.left_at IS NOT NULL AND si.left_at < si.entered_at))
    INTO v_interval_count,v_order_count,v_unverified_count,v_unlinked_count
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at < v_end AND coalesce(si.left_at,now()) > v_begin;

  SELECT count(*),
         count(*) FILTER (WHERE sp.evidence_state <> 'verified' OR
           sp.operation_id IS NULL OR sp.started_at < si.entered_at OR
           (si.left_at IS NOT NULL AND
             (sp.ended_at IS NULL OR sp.ended_at > si.left_at)) OR
           (sp.ended_at IS NOT NULL AND sp.ended_at <= sp.started_at))
    INTO v_pause_count,v_invalid_pause_count
    FROM public.dashboard_stage_pauses sp
    JOIN public.dashboard_stage_intervals si ON si.id=sp.stage_interval_id
    WHERE si.entered_at < v_end AND coalesce(si.left_at,now()) > v_begin;

  SELECT count(*) INTO v_sector_count
    FROM public.dashboard_sector_calendar_revisions s
    WHERE s.base_calendar_version_id=v_request.calendar_version_id
      AND s.effective_from<=v_request.exception_date
      AND (s.effective_until IS NULL OR s.effective_until>=v_request.exception_date);
  SELECT count(*) INTO v_threshold_count
    FROM public.dashboard_operational_thresholds t
    WHERE t.calendar_version_id=v_request.calendar_version_id;

  -- Conservative server fingerprint: stable date, request and evidence shapes.
  -- A transaction applying a correction must recompute all source durations
  -- and alert classifications instead of trusting this diagnostic fingerprint.
  SELECT pg_catalog.md5(coalesce(pg_catalog.string_agg(
    si.id::text||':'||si.order_id::text||':'||si.scope||':'||
    si.entered_at::text||':'||coalesce(si.left_at::text,'open')||':'||
    si.evidence_state||':'||coalesce(si.calendar_version_id::text,'none')||':'||
    coalesce(si.rule_revision_id::text,'none'),',' ORDER BY si.id),'')) INTO v_signature
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at < v_end AND coalesce(si.left_at,now()) > v_begin;

  IF v_rejected THEN
    v_reasons := v_reasons || jsonb_build_array('Solicitação já rejeitada.');
  END IF;
  IF v_order_count>300 THEN
    v_reasons := v_reasons || jsonb_build_array('Mais de 300 OS: simulação parcial não autoriza aprovação.');
  END IF;
  IF v_unverified_count>0 OR v_unlinked_count>0 OR v_invalid_pause_count>0 THEN
    v_reasons := v_reasons || jsonb_build_array('Há intervalos ou pausas sem evidência íntegra.');
  END IF;
  IF v_sector_count>0 THEN
    v_reasons := v_reasons || jsonb_build_array('Calendários por setor precisam de revalidação individual.');
  END IF;
  IF v_threshold_count>0 THEN
    v_reasons := v_reasons || jsonb_build_array('Limites Atenção/Crítico exigem recálculo de alertas no servidor.');
  END IF;
  v_reasons := v_reasons || jsonb_build_array(
    'Ainda falta cálculo transacional, no servidor, da diferença exata por OS e da cobertura histórica.'
  );

  RETURN jsonb_build_object(
    'request_id',v_request.id,
    'exception_date',v_request.exception_date,
    'calendar_version_id',v_request.calendar_version_id,
    'candidate_orders',v_order_count,
    'stage_intervals',v_interval_count,
    'unverified_intervals',v_unverified_count,
    'unlinked_intervals',v_unlinked_count,
    'recorded_pauses',v_pause_count,
    'incomplete_pauses',v_invalid_pause_count,
    'sector_revisions_to_check',v_sector_count,
    'thresholds_to_check',v_threshold_count,
    'evidence_fingerprint',v_signature,
    'historical_coverage_verified',false,
    'duration_impact_verified',false,
    'alert_impact_verified',false,
    'approval_allowed',false,
    'application_allowed',false,
    'reasons',v_reasons
  );
END $$;

-- Manager can document an approval dossier, not grant approval. Re-checks the
-- authoritative preview within the same transaction and never applies changes.
CREATE FUNCTION public.dashboard_prepare_calendar_retro_approval(
  p_request_id uuid,p_expected_preview jsonb,p_reason text
) RETURNS public.dashboard_calendar_retro_approval_dossiers
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;
  v_preview jsonb;
  v_saved public.dashboard_calendar_retro_approval_dossiers;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_request_id IS NULL OR p_expected_preview IS NULL OR
     jsonb_typeof(p_expected_preview)<>'object' OR
     p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Justificativa e prévia gerencial são obrigatórias'
      USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-retro-approval:'||p_request_id::text,0)
  );
  v_preview := public.dashboard_preview_calendar_retro_approval_preflight(p_request_id);
  IF v_preview IS DISTINCT FROM p_expected_preview THEN
    RAISE EXCEPTION 'A evidência mudou. Atualize a análise antes de encaminhar.'
      USING ERRCODE='40001';
  END IF;
  IF (v_preview->>'approval_allowed')::boolean IS DISTINCT FROM false OR
     (v_preview->>'application_allowed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Estado de revisão não seguro' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dashboard_calendar_retro_review_events e
             WHERE e.request_id=p_request_id AND e.action='rejected') THEN
    RAISE EXCEPTION 'Solicitação rejeitada não pode ser encaminhada'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.dashboard_calendar_retro_approval_dossiers(
    request_id,snapshot,reason,created_by
  ) VALUES(p_request_id,v_preview,btrim(p_reason),v_actor)
    RETURNING * INTO v_saved;
  RETURN v_saved;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_approval_preflight(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_prepare_calendar_retro_approval(uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_retro_approval_preflight(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_prepare_calendar_retro_approval(uuid,jsonb,text)
  TO authenticated;
