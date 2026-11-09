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

  -- Snapshot of all consulted evidence, not only stage intervals. Revisions,
  -- pauses, rule links, exception and review events are part of the digest.
  -- It remains diagnostic: no approval is authorized by a hash.
  SELECT pg_catalog.md5(
    to_jsonb(v_request)::text || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.id)::text
      FROM public.dashboard_stage_intervals si
      WHERE si.entered_at<v_end AND coalesce(si.left_at,now())>v_begin),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.id)::text
      FROM public.dashboard_stage_pauses sp
      JOIN public.dashboard_stage_intervals si ON si.id=sp.stage_interval_id
      WHERE si.entered_at<v_end AND coalesce(si.left_at,now())>v_begin),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(ex) ORDER BY ex.id)::text
      FROM public.dashboard_work_calendar_exceptions ex
      WHERE ex.calendar_version_id=v_request.calendar_version_id
        AND ex.exception_date=v_request.exception_date),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(period) ORDER BY period.id)::text
      FROM public.dashboard_work_calendar_periods period
      WHERE period.calendar_version_id=v_request.calendar_version_id),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(calendar) ORDER BY calendar.version)::text
      FROM public.dashboard_work_calendar_versions calendar
      WHERE calendar.effective_from<=v_request.exception_date),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(sector) ORDER BY sector.id)::text
      FROM public.dashboard_sector_calendar_revisions sector
      WHERE sector.base_calendar_version_id=v_request.calendar_version_id
        AND sector.effective_from<=v_request.exception_date
        AND (sector.effective_until IS NULL OR sector.effective_until>=v_request.exception_date)),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(threshold) ORDER BY threshold.scope)::text
      FROM public.dashboard_operational_thresholds threshold
      WHERE threshold.calendar_version_id=v_request.calendar_version_id),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(rule) ORDER BY rule.id)::text
      FROM public.dashboard_operational_rule_revisions rule
      WHERE EXISTS (
        SELECT 1 FROM public.dashboard_stage_intervals si
        WHERE si.rule_revision_id=rule.id AND
          si.entered_at<v_end AND coalesce(si.left_at,now())>v_begin
      )),'[]') || '|' ||
    coalesce((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.id)::text
      FROM public.dashboard_calendar_retro_review_events event
      WHERE event.request_id=p_request_id),'[]')
  ) INTO v_signature;

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
  v_request public.dashboard_calendar_retro_review_requests;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_request_id IS NULL OR p_expected_preview IS NULL OR
     jsonb_typeof(p_expected_preview)<>'object' OR
     p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Justificativa e prévia gerencial são obrigatórias'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_request
    FROM public.dashboard_calendar_retro_review_requests
    WHERE id=p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação histórica não encontrada' USING ERRCODE='22023';
  END IF;
  -- Shared date lock serializes against rejection and resubmission.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-retro-review:'||
      v_request.calendar_version_id::text||':'||v_request.exception_date::text,0)
  );
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


-- Consultative, server-computed day impact, still NEVER an approval.
-- Only evaluates the specific historical date and base-calendar shifts. When
-- a sector revision is applicable, evidence is incomplete or the stage's
-- pinned calendar differs, individual rows are explicitly inconclusive.
-- This is not a replacement for an atomic, multi-day, per-OS approval engine.
CREATE FUNCTION public.dashboard_preview_calendar_retro_day_stage_impact(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_request public.dashboard_calendar_retro_review_requests;
  v_original public.dashboard_work_calendar_exceptions;
  v_date_start timestamptz;
  v_date_end timestamptz;
  v_now timestamptz := now();
  v_old_windows tstzmultirange := '{}'::tstzmultirange;
  v_new_windows tstzmultirange := '{}'::tstzmultirange;
  v_pause_union tstzmultirange;
  v_stage record;
  v_threshold public.dashboard_operational_thresholds;
  v_alert_status text;
  v_alert_reason text;
  v_alert_recalculation_candidates integer := 0;
  v_alert_inconclusive_intervals integer := 0;
  v_window tstzrange;
  v_pause tstzrange;
  v_clipped tstzrange;
  v_overlap tstzrange;
  v_start timestamptz;
  v_end timestamptz;
  v_old_seconds numeric;
  v_new_seconds numeric;
  v_old_pause_seconds numeric;
  v_new_pause_seconds numeric;
  v_pause_invalid integer;
  v_sector_active boolean;
  v_stage_count integer;
  v_order_count integer;
  v_unverified integer := 0;
  v_verified integer := 0;
  v_affected integer := 0;
  v_reason text;
  v_old_minutes integer;
  v_new_minutes integer;
  v_old_pause integer;
  v_new_pause integer;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.dashboard_assert_manager();
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Identifique a solicitação para a prévia' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_request
    FROM public.dashboard_calendar_retro_review_requests
    WHERE id=p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação retroativa não encontrada' USING ERRCODE='22023';
  END IF;
  PERFORM public.dashboard_preview_calendar_retro_request(
    v_request.calendar_version_id,v_request.exception_date
  );
  IF EXISTS (
    SELECT 1 FROM public.dashboard_calendar_retro_review_events
    WHERE request_id=p_request_id AND action='rejected'
  ) THEN
    RAISE EXCEPTION 'Solicitação rejeitada: simulação indisponível'
      USING ERRCODE='22023';
  END IF;

  v_date_start := v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_date_end := (v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT count(*)::integer, count(DISTINCT order_id)::integer
    INTO v_stage_count,v_order_count
    FROM public.dashboard_stage_intervals
    WHERE entered_at<v_date_end AND coalesce(left_at,v_now)>v_date_start;
  IF v_stage_count>1200 OR v_order_count>300 THEN
    RAISE EXCEPTION
      'A simulação por OS excedeu o limite de leitura íntegra (1200 etapas ou 300 OS).'
      USING ERRCODE='54000';
  END IF;

  SELECT * INTO v_original FROM public.dashboard_work_calendar_exceptions
    WHERE calendar_version_id=v_request.calendar_version_id
      AND exception_date=v_request.exception_date;
  IF FOUND THEN
    IF v_original.working THEN
      v_old_windows := tstzmultirange(tstzrange(
        (v_request.exception_date+v_original.starts_local)
          AT TIME ZONE 'America/Sao_Paulo',
        (v_request.exception_date+v_original.ends_local)
          AT TIME ZONE 'America/Sao_Paulo','[)'
      ));
    END IF;
  ELSE
    SELECT coalesce(pg_catalog.range_agg(tstzrange(
      (v_request.exception_date+p.starts_local)
        AT TIME ZONE 'America/Sao_Paulo',
      (v_request.exception_date+p.ends_local)
        AT TIME ZONE 'America/Sao_Paulo','[)'
    )),'{}'::tstzmultirange)
      INTO v_old_windows
      FROM public.dashboard_work_calendar_periods p
      WHERE p.calendar_version_id=v_request.calendar_version_id
        AND p.weekday=extract(dow FROM v_request.exception_date)::integer;
  END IF;
  IF v_request.proposed_working THEN
    v_new_windows := tstzmultirange(tstzrange(
      (v_request.exception_date+v_request.proposed_start)
        AT TIME ZONE 'America/Sao_Paulo',
      (v_request.exception_date+v_request.proposed_end)
        AT TIME ZONE 'America/Sao_Paulo','[)'
    ));
  END IF;

  FOR v_stage IN
    SELECT si.id,si.order_id,si.scope,si.entered_at,si.left_at,
           si.evidence_state,si.calendar_version_id,si.rule_revision_id
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at<v_date_end AND coalesce(si.left_at,v_now)>v_date_start
    ORDER BY si.order_id,si.entered_at,si.id
  LOOP
    v_reason := NULL;
    v_start := greatest(v_stage.entered_at,v_date_start);
    v_end := least(coalesce(v_stage.left_at,v_now),v_date_end);
    IF v_end<=v_start THEN
      v_reason := 'Etapa com duração não positiva na data solicitada.';
    ELSIF v_stage.evidence_state<>'verified' OR
          v_stage.calendar_version_id IS DISTINCT FROM v_request.calendar_version_id OR
          v_stage.rule_revision_id IS NULL THEN
      v_reason := 'Etapa sem evidência íntegra ou versão de calendário compatível.';
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.dashboard_sector_calendar_revisions s
      WHERE s.scope=v_stage.scope
        AND s.base_calendar_version_id=v_request.calendar_version_id
        AND s.effective_from<=v_request.exception_date
        AND (s.effective_until IS NULL OR
          s.effective_until>=v_request.exception_date)
    ) INTO v_sector_active;
    IF v_sector_active THEN
      v_reason := 'Calendário por setor vigente: impacto exige cálculo setorial específico.';
    END IF;

    SELECT count(*) FILTER (WHERE p.evidence_state<>'verified' OR
        p.operation_id IS NULL OR p.started_at<v_stage.entered_at OR
        (p.ended_at IS NULL AND v_stage.left_at IS NOT NULL) OR
        p.ended_at IS NULL OR
        (p.ended_at IS NOT NULL AND
          (p.ended_at<=p.started_at OR
           (v_stage.left_at IS NOT NULL AND p.ended_at>v_stage.left_at) OR
           p.ended_at>v_now)))::integer
      INTO v_pause_invalid
      FROM public.dashboard_stage_pauses p WHERE p.stage_interval_id=v_stage.id;
    IF v_pause_invalid>0 THEN
      v_reason := 'Uma ou mais pausas estão abertas, inconsistentes ou sem verificação.';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_alert_status := 'insufficient';
      v_alert_reason := 'Alertas não avaliáveis sem comprovação da jornada e das pausas.';
      v_alert_inconclusive_intervals := v_alert_inconclusive_intervals+1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'order_id',v_stage.order_id,'interval_id',v_stage.id,
        'scope',v_stage.scope,'state','insufficient','reason',v_reason,
        'alert_review_status',v_alert_status,'alert_review_reason',v_alert_reason,
        'minutes_before',NULL,'minutes_proposed',NULL,
        'pause_minutes_before',NULL,'pause_minutes_proposed',NULL,
        'useful_minutes_before',NULL,'useful_minutes_proposed',NULL
      ));
      v_unverified := v_unverified+1;
      CONTINUE;
    END IF;

    SELECT coalesce(pg_catalog.range_agg(tstzrange(
      greatest(p.started_at,v_start),least(p.ended_at,v_end),'[)'
    )),'{}'::tstzmultirange)
      INTO v_pause_union
      FROM public.dashboard_stage_pauses p
      WHERE p.stage_interval_id=v_stage.id
        AND p.started_at<v_end AND p.ended_at>v_start;
    v_old_seconds := 0;
    v_new_seconds := 0;
    v_old_pause_seconds := 0;
    v_new_pause_seconds := 0;

    FOR v_window IN SELECT unnest(v_old_windows) LOOP
      v_clipped := v_window * tstzrange(v_start,v_end,'[)');
      IF isempty(v_clipped) THEN CONTINUE; END IF;
      v_old_seconds := v_old_seconds+
        extract(epoch FROM upper(v_clipped)-lower(v_clipped));
      FOR v_pause IN SELECT unnest(v_pause_union) LOOP
        v_overlap := v_pause * v_clipped;
        IF NOT isempty(v_overlap) THEN
          v_old_pause_seconds := v_old_pause_seconds+
            extract(epoch FROM upper(v_overlap)-lower(v_overlap));
        END IF;
      END LOOP;
    END LOOP;
    FOR v_window IN SELECT unnest(v_new_windows) LOOP
      v_clipped := v_window * tstzrange(v_start,v_end,'[)');
      IF isempty(v_clipped) THEN CONTINUE; END IF;
      v_new_seconds := v_new_seconds+
        extract(epoch FROM upper(v_clipped)-lower(v_clipped));
      FOR v_pause IN SELECT unnest(v_pause_union) LOOP
        v_overlap := v_pause * v_clipped;
        IF NOT isempty(v_overlap) THEN
          v_new_pause_seconds := v_new_pause_seconds+
            extract(epoch FROM upper(v_overlap)-lower(v_overlap));
        END IF;
      END LOOP;
    END LOOP;

    -- Do not turn sub-minute timestamps into misleading exact-minute effects.
    IF mod(v_old_seconds,60)<>0 OR mod(v_new_seconds,60)<>0 OR
       mod(v_old_pause_seconds,60)<>0 OR mod(v_new_pause_seconds,60)<>0 THEN
      v_alert_inconclusive_intervals := v_alert_inconclusive_intervals+1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'order_id',v_stage.order_id,'interval_id',v_stage.id,
        'scope',v_stage.scope,'state','insufficient',
        'reason','Há segundos fracionários: arredondamento exige conferência.',
        'alert_review_status','insufficient',
        'alert_review_reason','Alertas não avaliáveis sem arredondamento comprovado.',
        'minutes_before',NULL,'minutes_proposed',NULL,
        'pause_minutes_before',NULL,'pause_minutes_proposed',NULL,
        'useful_minutes_before',NULL,'useful_minutes_proposed',NULL
      ));
      v_unverified := v_unverified+1;
      CONTINUE;
    END IF;
    v_old_minutes := (v_old_seconds/60)::integer;
    v_new_minutes := (v_new_seconds/60)::integer;
    v_old_pause := (v_old_pause_seconds/60)::integer;
    v_new_pause := (v_new_pause_seconds/60)::integer;
    IF v_old_pause>v_old_minutes OR v_new_pause>v_new_minutes THEN
      RAISE EXCEPTION 'Sobreposição de pausas inconsistente: verificação bloqueada'
        USING ERRCODE='22023';
    END IF;
    -- Never infer the *total* current alert from a single-day change.
    -- Eligible open stages are flagged for recomputation against their
    -- full history; closed stages require historical audit, not current alert
    -- classification. Published thresholds can have changed since entry.
    IF v_old_minutes=v_new_minutes AND v_old_pause=v_new_pause THEN
      v_alert_status := 'no_day_change';
      v_alert_reason := 'A proposta não altera minutos deste dia para esta etapa.';
    ELSIF v_stage.left_at IS NOT NULL THEN
      v_alert_status := 'historical_review';
      v_alert_reason := 'Etapa encerrada: eventuais alertas anteriores exigem revisão histórica.';
      v_alert_inconclusive_intervals := v_alert_inconclusive_intervals+1;
    ELSE
      SELECT * INTO v_threshold
        FROM public.dashboard_operational_thresholds t
        WHERE t.scope=v_stage.scope;
      IF NOT FOUND OR v_threshold.calendar_version_id IS DISTINCT FROM
          v_stage.calendar_version_id OR
          v_threshold.effective_from>v_stage.entered_at OR
          v_threshold.updated_at>v_stage.entered_at THEN
        v_alert_status := 'unavailable';
        v_alert_reason := 'Limites publicados não comprovam vigência na entrada desta etapa.';
        v_alert_inconclusive_intervals := v_alert_inconclusive_intervals+1;
      ELSE
        v_alert_status := 'requires_recalculation';
        v_alert_reason := 'Limites candidatos identificados; falta recalcular toda a permanência e os alertas no servidor.';
        v_alert_recalculation_candidates := v_alert_recalculation_candidates+1;
      END IF;
    END IF;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'order_id',v_stage.order_id,'interval_id',v_stage.id,
      'scope',v_stage.scope,'state','verified',
      'alert_review_status',v_alert_status,'alert_review_reason',v_alert_reason,
      'reason','Prévia de um dia no calendário geral; sem revisão de alertas.',
      'minutes_before',v_old_minutes,
      'minutes_proposed',v_new_minutes,
      'pause_minutes_before',v_old_pause,
      'pause_minutes_proposed',v_new_pause,
      'useful_minutes_before',v_old_minutes-v_old_pause,
      'useful_minutes_proposed',v_new_minutes-v_new_pause
    ));
    v_verified := v_verified+1;
    IF v_old_minutes<>v_new_minutes OR v_old_pause<>v_new_pause THEN
      v_affected := v_affected+1;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_rows)<>v_stage_count THEN
    RAISE EXCEPTION 'O conjunto de etapas mudou durante a leitura. Atualize.'
      USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object(
    'request_id',v_request.id,'exception_date',v_request.exception_date,
    'as_of',v_now,'candidate_orders',v_order_count,
    'candidate_intervals',v_stage_count,
    'verified_intervals',v_verified,
    'insufficient_intervals',v_unverified,
    'changed_intervals',v_affected,
    'alert_recalculation_candidates',v_alert_recalculation_candidates,
    'alert_review_inconclusive_intervals',v_alert_inconclusive_intervals,
    'rows',v_rows,
    'scope','calendar_base_single_day',
    'historical_coverage_verified',false,
    'alerts_verified',false,
    'approval_allowed',false,'application_allowed',false,
    'observacao','Prévia consultiva para um único dia no calendário geral. Calendários setoriais, histórico anterior à instrumentação e classificação completa de alertas não são comprovados; nenhuma correção será aplicada.'
  );
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_day_stage_impact(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_retro_day_stage_impact(uuid)
  TO authenticated;


-- Full-stage what-if preview, READ ONLY. It enumerates every local calendar
-- day through the stage end and counts verified recorded pauses as a union.
-- Sector-specific calendars and unverifiable historical revisions fail closed.
-- An alert is a *candidate* based on current threshold rows, not permission to
-- change a historical alert. No updates, approvals, or applications occur.
CREATE FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_request public.dashboard_calendar_retro_review_requests;
  v_stage record;
  v_calendar public.dashboard_work_calendar_versions;
  v_calendar_today public.dashboard_work_calendar_versions;
  v_exception public.dashboard_work_calendar_exceptions;
  v_threshold public.dashboard_operational_thresholds;
  v_now timestamptz := now();
  v_start_day date;
  v_last_day date;
  v_day date;
  v_end timestamptz;
  v_old_windows tstzmultirange;
  v_new_windows tstzmultirange;
  v_pauses tstzmultirange;
  v_window tstzrange;
  v_pause tstzrange;
  v_intersection tstzrange;
  v_pause_intersection tstzrange;
  v_full_range tstzrange;
  v_gross_before numeric;
  v_gross_proposed numeric;
  v_pause_before numeric;
  v_pause_proposed numeric;
  v_min_before integer;
  v_min_proposed integer;
  v_pause_min_before integer;
  v_pause_min_proposed integer;
  v_severity_before text;
  v_severity_proposed text;
  v_severity_status text;
  v_reason text;
  v_total integer;
  v_invalid_pauses integer;
  v_candidate_orders integer;
  v_verified integer := 0;
  v_inconclusive integer := 0;
  v_candidate_alert_changes integer := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.dashboard_assert_manager();
  SELECT * INTO v_request FROM public.dashboard_calendar_retro_review_requests
    WHERE id=p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação retroativa não encontrada' USING ERRCODE='22023';
  END IF;
  PERFORM public.dashboard_preview_calendar_retro_request(
    v_request.calendar_version_id,v_request.exception_date
  );
  IF EXISTS(SELECT 1 FROM public.dashboard_calendar_retro_review_events
    WHERE request_id=p_request_id AND action='rejected') THEN
    RAISE EXCEPTION 'Solicitação rejeitada não pode ser simulada'
      USING ERRCODE='22023';
  END IF;

  SELECT count(*)::integer,count(DISTINCT si.order_id)::integer
    INTO v_total,v_candidate_orders
    FROM public.dashboard_stage_intervals si
    WHERE si.entered_at <
      ((v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND coalesce(si.left_at,v_now) >
      (v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo');
  IF v_total>1200 OR v_candidate_orders>300 THEN
    RAISE EXCEPTION 'OS ou etapas excedem os limites de simulação integral'
      USING ERRCODE='54000';
  END IF;

  FOR v_stage IN
    SELECT si.* FROM public.dashboard_stage_intervals si
    WHERE si.entered_at <
      ((v_request.exception_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND coalesce(si.left_at,v_now) >
      (v_request.exception_date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY si.order_id,si.entered_at,si.id
  LOOP
    v_reason := NULL;
    v_severity_before := NULL;
    v_severity_proposed := NULL;
    v_severity_status := 'unavailable';
    v_end := coalesce(v_stage.left_at,v_now);
    v_start_day := (v_stage.entered_at AT TIME ZONE 'America/Sao_Paulo')::date;
    v_last_day := ((v_end - interval '1 microsecond')
      AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_end<=v_stage.entered_at OR v_end>v_now THEN
      v_reason := 'Etapa sem permanência positiva ou com término futuro.';
    ELSIF v_last_day<v_start_day OR v_last_day-v_start_day>365 THEN
      v_reason := 'A permanência ultrapassa a janela verificável de 366 dias.';
    ELSIF v_stage.evidence_state<>'verified'
      OR v_stage.calendar_version_id IS NULL
      OR v_stage.rule_revision_id IS NULL THEN
      v_reason := 'Marco ou revisão histórica da etapa não verificados.';
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.dashboard_operational_rule_revisions rev
      WHERE rev.id=v_stage.rule_revision_id AND rev.changed_at<=v_stage.entered_at
    ) THEN
      v_reason := 'Revisão operacional da entrada não comprovada.';
    END IF;
    IF v_reason IS NULL THEN
      SELECT count(*)::integer INTO v_invalid_pauses
        FROM public.dashboard_stage_pauses sp
        WHERE sp.stage_interval_id=v_stage.id
          AND (sp.evidence_state<>'verified' OR sp.operation_id IS NULL
            OR sp.ended_at IS NULL OR sp.started_at<v_stage.entered_at
            OR sp.ended_at>v_end OR sp.ended_at<=sp.started_at);
      IF v_invalid_pauses>0 THEN
        v_reason := 'Pausas ausentes, abertas ou sem evidência íntegra.';
      END IF;
    END IF;

    IF v_reason IS NULL THEN
      SELECT coalesce(pg_catalog.range_agg(tstzrange(
        sp.started_at,sp.ended_at,'[)'
      )),'{}'::tstzmultirange)
        INTO v_pauses FROM public.dashboard_stage_pauses sp
        WHERE sp.stage_interval_id=v_stage.id;
      v_full_range := tstzrange(v_stage.entered_at,v_end,'[)');
      v_gross_before := 0;
      v_gross_proposed := 0;
      v_pause_before := 0;
      v_pause_proposed := 0;

      FOR v_day IN SELECT generate_series(
        v_start_day::timestamp,v_last_day::timestamp,'1 day'::interval
      )::date LOOP
        SELECT * INTO v_calendar FROM public.dashboard_work_calendar_versions c
        WHERE c.effective_from<=v_day
        ORDER BY c.effective_from DESC,c.version DESC LIMIT 1;
        IF NOT FOUND OR v_calendar.status<>'published' OR
           v_calendar.time_zone<>'America/Sao_Paulo' OR
           (v_calendar.effective_until IS NOT NULL AND v_calendar.effective_until<v_day) THEN
          v_reason := 'Existe dia sem versão global de calendário publicada e vigente.';
          EXIT;
        END IF;
        IF v_day=v_start_day AND
           v_calendar.id IS DISTINCT FROM v_stage.calendar_version_id THEN
          v_reason := 'A revisão da entrada não coincide com o calendário vigente.';
          EXIT;
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.dashboard_sector_calendar_revisions sc
          WHERE sc.scope=v_stage.scope AND
            sc.base_calendar_version_id=v_calendar.id AND
            sc.effective_from<=v_day AND
            (sc.effective_until IS NULL OR sc.effective_until>=v_day)
        ) THEN
          v_reason := 'Jornada setorial na permanência exige cálculo setorial próprio.';
          EXIT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.dashboard_work_calendar_periods p
          WHERE p.calendar_version_id=v_calendar.id
        ) THEN
          v_reason := 'Não há expediente semanal verificável nesta versão.';
          EXIT;
        END IF;
        v_old_windows := '{}'::tstzmultirange;
        v_new_windows := '{}'::tstzmultirange;
        SELECT * INTO v_exception FROM public.dashboard_work_calendar_exceptions e
        WHERE e.calendar_version_id=v_calendar.id AND e.exception_date=v_day;
        IF FOUND THEN
          IF v_exception.working THEN
            v_old_windows := tstzmultirange(tstzrange(
              (v_day+v_exception.starts_local) AT TIME ZONE 'America/Sao_Paulo',
              (v_day+v_exception.ends_local) AT TIME ZONE 'America/Sao_Paulo','[)'
            ));
          END IF;
        ELSE
          SELECT coalesce(pg_catalog.range_agg(tstzrange(
            (v_day+p.starts_local) AT TIME ZONE 'America/Sao_Paulo',
            (v_day+p.ends_local) AT TIME ZONE 'America/Sao_Paulo','[)'
          )),'{}'::tstzmultirange)
            INTO v_old_windows
          FROM public.dashboard_work_calendar_periods p
          WHERE p.calendar_version_id=v_calendar.id
            AND p.weekday=extract(dow FROM v_day)::integer;
        END IF;

        IF v_day=v_request.exception_date THEN
          IF v_request.proposed_working THEN
            v_new_windows := tstzmultirange(tstzrange(
              (v_day+v_request.proposed_start) AT TIME ZONE 'America/Sao_Paulo',
              (v_day+v_request.proposed_end) AT TIME ZONE 'America/Sao_Paulo','[)'
            ));
          END IF;
        ELSE
          v_new_windows := v_old_windows;
        END IF;

        FOR v_window IN SELECT unnest(v_old_windows) LOOP
          v_intersection := v_window * v_full_range;
          IF isempty(v_intersection) THEN CONTINUE; END IF;
          v_gross_before := v_gross_before +
            extract(epoch FROM upper(v_intersection)-lower(v_intersection));
          FOR v_pause IN SELECT unnest(v_pauses) LOOP
            v_pause_intersection := v_pause * v_intersection;
            IF NOT isempty(v_pause_intersection) THEN
              v_pause_before := v_pause_before+
                extract(epoch FROM upper(v_pause_intersection)-lower(v_pause_intersection));
            END IF;
          END LOOP;
        END LOOP;
        FOR v_window IN SELECT unnest(v_new_windows) LOOP
          v_intersection := v_window * v_full_range;
          IF isempty(v_intersection) THEN CONTINUE; END IF;
          v_gross_proposed := v_gross_proposed +
            extract(epoch FROM upper(v_intersection)-lower(v_intersection));
          FOR v_pause IN SELECT unnest(v_pauses) LOOP
            v_pause_intersection := v_pause * v_intersection;
            IF NOT isempty(v_pause_intersection) THEN
              v_pause_proposed := v_pause_proposed+
                extract(epoch FROM upper(v_pause_intersection)-lower(v_pause_intersection));
            END IF;
          END LOOP;
        END LOOP;
      END LOOP;
    END IF;

    IF v_reason IS NULL AND (
      mod(v_gross_before,60)<>0 OR mod(v_gross_proposed,60)<>0 OR
      mod(v_pause_before,60)<>0 OR mod(v_pause_proposed,60)<>0 OR
      v_pause_before>v_gross_before OR v_pause_proposed>v_gross_proposed
    ) THEN
      v_reason := 'Precisão temporal ou pausas não permitem contagem íntegra em minutos.';
    END IF;
    IF v_reason IS NOT NULL THEN
      v_inconclusive := v_inconclusive+1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'order_id',v_stage.order_id,'interval_id',v_stage.id,
        'scope',v_stage.scope,'state','insufficient','reason',v_reason,
        'gross_before',NULL,'gross_proposed',NULL,
        'pause_before',NULL,'pause_proposed',NULL,
        'useful_before',NULL,'useful_proposed',NULL,
        'severity_before',NULL,'severity_proposed',NULL,
        'severity_status','unavailable'
      ));
      CONTINUE;
    END IF;

    v_min_before := (v_gross_before/60)::integer;
    v_min_proposed := (v_gross_proposed/60)::integer;
    v_pause_min_before := (v_pause_before/60)::integer;
    v_pause_min_proposed := (v_pause_proposed/60)::integer;

    -- Current severity comparisons require current, published thresholds
    -- belonging to the same calendar AND unchanged since stage entry.
    -- Closed-stage alerts cannot be reconstructed as present-day alerts.
    SELECT * INTO v_threshold FROM public.dashboard_operational_thresholds t
      WHERE t.scope=v_stage.scope;
    SELECT * INTO v_calendar_today FROM public.dashboard_work_calendar_versions c
      WHERE c.effective_from <= (v_now AT TIME ZONE 'America/Sao_Paulo')::date
      ORDER BY c.effective_from DESC,c.version DESC LIMIT 1;
    IF v_stage.left_at IS NULL AND v_threshold.scope IS NOT NULL AND
       v_threshold.calendar_version_id=v_stage.calendar_version_id AND
       v_threshold.updated_at<=v_stage.entered_at AND
       v_threshold.effective_from<=v_stage.entered_at AND
       v_calendar_today.id=v_stage.calendar_version_id AND
       v_calendar_today.status='published' AND
       (v_calendar_today.effective_until IS NULL OR
         v_calendar_today.effective_until>=(v_now AT TIME ZONE 'America/Sao_Paulo')::date) THEN
      v_severity_before := CASE
        WHEN v_min_before>=v_threshold.critical_limit_minutes THEN 'critical'
        WHEN v_min_before>=v_threshold.attention_limit_minutes THEN 'attention'
        ELSE 'normal' END;
      v_severity_proposed := CASE
        WHEN v_min_proposed>=v_threshold.critical_limit_minutes THEN 'critical'
        WHEN v_min_proposed>=v_threshold.attention_limit_minutes THEN 'attention'
        ELSE 'normal' END;
      v_severity_status := 'candidate';
      IF v_severity_before IS DISTINCT FROM v_severity_proposed THEN
        v_candidate_alert_changes := v_candidate_alert_changes+1;
      END IF;
    ELSE
      v_severity_status := CASE WHEN v_stage.left_at IS NULL
        THEN 'threshold_unverified' ELSE 'historical_review' END;
    END IF;
    v_verified := v_verified+1;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'order_id',v_stage.order_id,'interval_id',v_stage.id,
      'scope',v_stage.scope,'state','verified',
      'reason','Contagem consultiva de toda a permanência registrada.',
      'gross_before',v_min_before,'gross_proposed',v_min_proposed,
      'pause_before',v_pause_min_before,'pause_proposed',v_pause_min_proposed,
      'useful_before',v_min_before-v_pause_min_before,
      'useful_proposed',v_min_proposed-v_pause_min_proposed,
      'severity_before',v_severity_before,
      'severity_proposed',v_severity_proposed,
      'severity_status',v_severity_status
    ));
  END LOOP;

  IF jsonb_array_length(v_rows)<>v_total THEN
    RAISE EXCEPTION 'Evidência de etapas mudou durante consulta'
      USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object(
    'request_id',v_request.id,'as_of',v_now,
    'candidate_orders',v_candidate_orders,'candidate_intervals',v_total,
    'verified_intervals',v_verified,'insufficient_intervals',v_inconclusive,
    'candidate_alert_changes',v_candidate_alert_changes,
    'rows',v_rows,'scope','full_stage_consultative',
    'historical_coverage_verified',false,'alerts_verified',false,
    'approval_allowed',false,'application_allowed',false,
    'observacao','Comparação consultiva de toda a permanência registrada, sujeito à revisão de cobertura histórica. Níveis de alerta são candidatos, não efeitos históricos confirmados.'
  );
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts(uuid)
  TO authenticated;
