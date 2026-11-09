-- Dashboard Operacional / Decisões 07, 38, 39 — solicitação de correção retroativa.
-- PROPOSTA, NÃO APLICADA. Esta migration NÃO autoriza nem altera calendário
-- histórico; apenas registra uma solicitação com prévia e trilha imutável.
CREATE TABLE public.dashboard_calendar_retro_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_version_id uuid NOT NULL
    REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  exception_date date NOT NULL,
  proposed_working boolean NOT NULL,
  proposed_start time,
  proposed_end time,
  previous_exception jsonb,
  preview jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  state text NOT NULL DEFAULT 'pending_review'
    CHECK (state='pending_review'),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (NOT proposed_working AND proposed_start IS NULL AND proposed_end IS NULL) OR
    (proposed_working AND proposed_start IS NOT NULL AND
     proposed_end IS NOT NULL AND proposed_end > proposed_start)
  )
);
CREATE INDEX dashboard_retro_review_lookup
  ON public.dashboard_calendar_retro_review_requests
  (calendar_version_id,exception_date,submitted_at DESC);
ALTER TABLE public.dashboard_calendar_retro_review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_calendar_retro_review_requests
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.dashboard_calendar_retro_review_requests
  TO authenticated;
CREATE POLICY dashboard_calendar_retro_review_manager_read
  ON public.dashboard_calendar_retro_review_requests FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE TRIGGER dashboard_retro_review_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_calendar_retro_review_requests
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- Preview is intentionally conservative; it reports the number of stage
-- intervals overlapping the date but not minute/alert differences without
-- complete verified interval and pause evidence.
CREATE FUNCTION public.dashboard_preview_calendar_retro_request(
  p_calendar_version_id uuid,p_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_calendar public.dashboard_work_calendar_versions;
  v_active_id uuid;
  v_existing public.dashboard_work_calendar_exceptions;
  v_begin timestamptz;
  v_end timestamptz;
  v_total integer;
  v_verified integer;
BEGIN
  PERFORM public.dashboard_assert_manager();
  IF p_calendar_version_id IS NULL OR p_date IS NULL OR
     p_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Correções retroativas exigem dia anterior ao atual'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_calendar FROM public.dashboard_work_calendar_versions
    WHERE id=p_calendar_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendário histórico não encontrado' USING ERRCODE='22023';
  END IF;
  -- Select the newest effective version BEFORE testing expiry; do not
  -- accidentally fall back to an old, superseded version after a gap.
  SELECT id INTO v_active_id
    FROM public.dashboard_work_calendar_versions c
    WHERE c.effective_from <= p_date
    ORDER BY c.effective_from DESC,c.version DESC LIMIT 1;
  IF v_active_id IS DISTINCT FROM p_calendar_version_id OR
     (v_calendar.effective_until IS NOT NULL AND p_date>v_calendar.effective_until) THEN
    RAISE EXCEPTION 'Dia não pertence à vigência efetiva desta versão'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_existing FROM public.dashboard_work_calendar_exceptions
    WHERE calendar_version_id=p_calendar_version_id AND exception_date=p_date;
  v_begin := (p_date::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_end := ((p_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  SELECT count(*)::integer,
         count(*) FILTER (WHERE evidence_state='verified')::integer
    INTO v_total,v_verified
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at<v_end AND coalesce(si.left_at,now())>v_begin;
  RETURN jsonb_build_object(
    'calendar_version_id',p_calendar_version_id,
    'exception_date',p_date,
    'existing_exception',CASE WHEN v_existing.id IS NULL THEN NULL
      ELSE jsonb_build_object('working',v_existing.working,
        'start',v_existing.starts_local,'end',v_existing.ends_local,
        'reason',v_existing.reason) END,
    'stage_intervals_candidates',v_total,
    'verified_stage_intervals_candidates',v_verified,
    'duration_impact_verified',false,
    'observacao','Prévia consultiva: nenhuma hora, alerta ou OS será modificada; a diferença exata depende de evidências completas.'
  );
END $$;

CREATE FUNCTION public.dashboard_request_calendar_retro_review(
  p_calendar_version_id uuid,p_date date,p_working boolean,
  p_start time,p_end time,p_reason text
) RETURNS public.dashboard_calendar_retro_review_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;
  v_preview jsonb;
  v_row public.dashboard_calendar_retro_review_requests;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_working IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR
     (p_working AND (p_start IS NULL OR p_end IS NULL OR p_end<=p_start)) OR
     (NOT p_working AND (p_start IS NOT NULL OR p_end IS NOT NULL)) THEN
    RAISE EXCEPTION 'Exceção retroativa ou justificativa inválida'
      USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-retro-review:'||p_calendar_version_id::text||':'||p_date::text,0)
  );
  v_preview := public.dashboard_preview_calendar_retro_request(p_calendar_version_id,p_date);
  -- Duplicate unresolved requests for a date should be reviewed rather than
  -- silently overwritten or filed repeatedly.
  IF EXISTS (
    SELECT 1 FROM public.dashboard_calendar_retro_review_requests r
    WHERE r.calendar_version_id=p_calendar_version_id
      AND r.exception_date=p_date AND r.state='pending_review'
  ) THEN
    RAISE EXCEPTION 'Já existe solicitação pendente para esta data e calendário'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.dashboard_calendar_retro_review_requests (
    calendar_version_id,exception_date,proposed_working,proposed_start,
    proposed_end,previous_exception,preview,reason,submitted_by
  ) VALUES (
    p_calendar_version_id,p_date,p_working,p_start,p_end,
    v_preview->'existing_exception',v_preview,btrim(p_reason),v_actor
  ) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_request(uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_request_calendar_retro_review(
  uuid,date,boolean,time,time,text
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_retro_request(uuid,date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_request_calendar_retro_review(
  uuid,date,boolean,time,time,text
) TO authenticated;
