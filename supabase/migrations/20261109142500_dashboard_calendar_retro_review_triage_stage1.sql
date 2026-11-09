-- EvoluSystem / Dashboard Operacional — revisão gerencial sem aplicação retroativa.
-- PROPOSTA NÃO APLICADA. Não altera calendário, OS, indicadores ou alertas.
-- Aprovação deliberadamente NÃO é oferecida: impacto por OS ainda não verificado.
CREATE TABLE public.dashboard_calendar_retro_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.dashboard_calendar_retro_review_requests(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('needs_evidence','rejected')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  preview jsonb NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dashboard_retro_review_events_lookup
  ON public.dashboard_calendar_retro_review_events(request_id,reviewed_at DESC,id DESC);
CREATE UNIQUE INDEX dashboard_retro_review_single_rejection
  ON public.dashboard_calendar_retro_review_events(request_id) WHERE action='rejected';
ALTER TABLE public.dashboard_calendar_retro_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_calendar_retro_review_events
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.dashboard_calendar_retro_review_events TO authenticated;
CREATE POLICY dashboard_retro_review_events_manager_read
  ON public.dashboard_calendar_retro_review_events FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE TRIGGER dashboard_retro_review_events_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_calendar_retro_review_events
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- Measures only base-calendar planned minutes on one date, NOT work actually
-- performed by an OS. Sector exceptions, pauses, and cross-day thresholds
-- prevent asserting per-OS impact or approving retroactive corrections.
CREATE FUNCTION public.dashboard_preview_calendar_retro_review(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_request public.dashboard_calendar_retro_review_requests;
  v_live jsonb;
  v_exception public.dashboard_work_calendar_exceptions;
  v_before integer := 0;
  v_after integer := 0;
  v_unverified integer := 0;
  v_open integer := 0;
  v_sector integer := 0;
  v_thresholds integer := 0;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_rejected boolean;
BEGIN
  PERFORM public.dashboard_assert_manager();
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma solicitação' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_request FROM public.dashboard_calendar_retro_review_requests
    WHERE id=p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING ERRCODE='22023';
  END IF;
  v_live := public.dashboard_preview_calendar_retro_request(
    v_request.calendar_version_id,v_request.exception_date
  );
  SELECT * INTO v_exception FROM public.dashboard_work_calendar_exceptions
    WHERE calendar_version_id=v_request.calendar_version_id
      AND exception_date=v_request.exception_date;
  IF FOUND THEN
    IF v_exception.working THEN
      v_before := (extract(epoch FROM
        (v_exception.ends_local - v_exception.starts_local))/60)::integer;
    END IF;
  ELSE
    SELECT coalesce(sum(extract(epoch FROM (p.ends_local-p.starts_local))/60),0)::integer
      INTO v_before
    FROM public.dashboard_work_calendar_periods p
    WHERE p.calendar_version_id=v_request.calendar_version_id
      AND p.weekday=extract(dow FROM v_request.exception_date)::integer;
  END IF;
  IF v_request.proposed_working THEN
    v_after := (extract(epoch FROM
      (v_request.proposed_end-v_request.proposed_start))/60)::integer;
  END IF;
  v_day_start := v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_day_end := (v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  SELECT count(*) FILTER (WHERE si.evidence_state <> 'verified')::integer,
         count(*) FILTER (WHERE si.left_at IS NULL)::integer
    INTO v_unverified,v_open
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at<v_day_end AND coalesce(si.left_at,now())>v_day_start;
  SELECT count(DISTINCT s.scope)::integer INTO v_sector
    FROM public.dashboard_sector_calendar_revisions s
    WHERE s.base_calendar_version_id=v_request.calendar_version_id
      AND s.effective_from<=v_request.exception_date
      AND (s.effective_until IS NULL OR s.effective_until>=v_request.exception_date);
  SELECT count(*)::integer INTO v_thresholds
    FROM public.dashboard_operational_thresholds t
    WHERE t.calendar_version_id=v_request.calendar_version_id;
  SELECT EXISTS(SELECT 1 FROM public.dashboard_calendar_retro_review_events e
    WHERE e.request_id=p_request_id AND e.action='rejected') INTO v_rejected;
  RETURN jsonb_build_object(
    'request_id',v_request.id,
    'calendar_version_id',v_request.calendar_version_id,
    'exception_date',v_request.exception_date,
    'base_minutes_before',v_before,
    'base_minutes_proposed',v_after,
    'base_minutes_delta',v_after-v_before,
    'stage_intervals_candidates',v_live->'stage_intervals_candidates',
    'verified_stage_intervals_candidates',v_live->'verified_stage_intervals_candidates',
    'unverified_stage_intervals',v_unverified,
    'open_stage_intervals',v_open,
    'sector_calendars_to_review',v_sector,
    'thresholds_to_review',v_thresholds,
    'already_rejected',v_rejected,
    'duration_impact_verified',false,
    'alert_impact_verified',false,
    'approval_allowed',false,
    'observacao','A diferença comprovada é apenas do expediente teórico do calendário geral nesse dia. Não representa horas trabalhadas, alertas ou prazos das OS. Aprovação e aplicação indisponíveis.'
  );
END $$;

-- Immutable managerial opinion only. Uses an exact server-side re-preview and
-- refuses a stale client preview. Never records an approval or applies changes.
CREATE FUNCTION public.dashboard_record_calendar_retro_review(
  p_request_id uuid,p_action text,p_reason text,p_expected_preview jsonb
) RETURNS public.dashboard_calendar_retro_review_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;
  v_preview jsonb;
  v_saved public.dashboard_calendar_retro_review_events;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_request_id IS NULL OR p_action IS NULL OR
     p_action NOT IN ('needs_evidence','rejected') OR
     p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR
     p_expected_preview IS NULL OR jsonb_typeof(p_expected_preview)<>'object' THEN
    RAISE EXCEPTION 'Parecer ou justificativa inválidos' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-retro-review-decision:'||p_request_id::text,0)
  );
  v_preview := public.dashboard_preview_calendar_retro_review(p_request_id);
  IF v_preview IS DISTINCT FROM p_expected_preview THEN
    RAISE EXCEPTION 'Prévia desatualizada; atualize antes de registrar o parecer'
      USING ERRCODE='40001';
  END IF;
  IF (v_preview->>'already_rejected')::boolean THEN
    RAISE EXCEPTION 'Solicitação já rejeitada' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.dashboard_calendar_retro_review_events
    (request_id,action,reason,preview,reviewed_by)
    VALUES (p_request_id,p_action,btrim(p_reason),v_preview,v_actor)
    RETURNING * INTO v_saved;
  RETURN v_saved;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_review(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_record_calendar_retro_review(uuid,text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_retro_review(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_record_calendar_retro_review(uuid,text,text,jsonb)
  TO authenticated;
