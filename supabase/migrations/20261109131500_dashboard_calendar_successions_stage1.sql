-- EvoluSystem / Dashboard Operacional — calendário geral, sucessão prospectiva.
-- MIGRATION PROPOSTA; não aplicada em produção.
-- Preserva os registros de calendário de todas as versões anteriores sem UPDATE.
-- A versão com maior effective_from vigente em cada data prevalece no cliente,
-- mesmo quando a versão predecessora possuía effective_until=NULL.
-- Protect even the preexisting first-publication RPC from silently backdating
-- an initial calendar. Authorized historical corrections use a separate channel.
CREATE FUNCTION public.dashboard_reject_backdated_calendar_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.effective_from < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Publicação retroativa exige solicitação e auditoria específicas'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_reject_backdated_calendar_insert()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER dashboard_calendar_no_implicit_backdate
  BEFORE INSERT ON public.dashboard_work_calendar_versions
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_backdated_calendar_insert();

CREATE TABLE public.dashboard_calendar_succession_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_calendar_version_id uuid NOT NULL
    REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  next_calendar_version_id uuid NOT NULL UNIQUE
    REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  preview jsonb NOT NULL,
  UNIQUE (previous_calendar_version_id, effective_from),
  CHECK (previous_calendar_version_id <> next_calendar_version_id)
);

ALTER TABLE public.dashboard_calendar_succession_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_calendar_succession_audit
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.dashboard_calendar_succession_audit TO authenticated;
CREATE POLICY dashboard_calendar_succession_audit_read
  ON public.dashboard_calendar_succession_audit FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE TRIGGER dashboard_calendar_succession_audit_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_calendar_succession_audit
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- Validates a planned (non-retroactive) effective date. This is internal-only;
-- invocation through the public RPCs always checks the manager at the boundary.
CREATE FUNCTION public.dashboard_validate_calendar_successor_date(
  p_effective_from date, p_expected_last_version integer
) RETURNS public.dashboard_work_calendar_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_latest public.dashboard_work_calendar_versions;
  v_local_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF p_effective_from IS NULL OR p_expected_last_version IS NULL OR
     p_expected_last_version < 1 OR p_effective_from < v_local_date THEN
    RAISE EXCEPTION 'Data prospectiva e revisão de calendário obrigatórias'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_latest FROM public.dashboard_work_calendar_versions
    ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR v_latest.version <> p_expected_last_version THEN
    RAISE EXCEPTION 'Calendário alterado: atualize a prévia'
      USING ERRCODE='40001';
  END IF;
  IF p_effective_from <= v_latest.effective_from OR
     (v_latest.effective_until IS NOT NULL AND
      p_effective_from > v_latest.effective_until + 1) THEN
    RAISE EXCEPTION 'A próxima vigência deve suceder a última, sem lacunas'
      USING ERRCODE='22023';
  END IF;
  RETURN v_latest;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_validate_calendar_successor_date(date,integer)
  FROM PUBLIC,anon,authenticated,service_role;

-- Preview does NOT modify OS, statuses, alerts, rule versions or calendars.
-- Affected stage counts are indicative; they are NOT verified duration changes.
CREATE FUNCTION public.dashboard_preview_calendar_successor(
  p_effective_from date, p_expected_last_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_previous public.dashboard_work_calendar_versions;
  v_open_intervals integer;
  v_future_intervals integer;
  v_rules integer;
  v_sector_revisions integer;
BEGIN
  PERFORM public.dashboard_assert_manager();
  v_previous := public.dashboard_validate_calendar_successor_date(
    p_effective_from,p_expected_last_version
  );
  SELECT count(*)::integer INTO v_open_intervals
    FROM public.dashboard_stage_intervals si
    WHERE si.calendar_version_id=v_previous.id AND si.left_at IS NULL;
  SELECT count(*)::integer INTO v_future_intervals
    FROM public.dashboard_stage_intervals si
    WHERE si.calendar_version_id=v_previous.id
      AND (si.entered_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_effective_from;
  SELECT count(*)::integer INTO v_rules
    FROM public.dashboard_operational_rules r
    WHERE r.calendar_version_id=v_previous.id;
  SELECT count(DISTINCT scope)::integer INTO v_sector_revisions
    FROM public.dashboard_sector_calendar_revisions c
    WHERE c.base_calendar_version_id=v_previous.id
      AND c.effective_from<=p_effective_from
      AND (c.effective_until IS NULL OR c.effective_until>=p_effective_from);
  RETURN jsonb_build_object(
    'previous_version',v_previous.version,
    'previous_calendar_id',v_previous.id,
    'effective_from',p_effective_from,
    'old_effective_until',v_previous.effective_until,
    'open_stage_intervals',v_open_intervals,
    'stage_intervals_from_effective_date',v_future_intervals,
    'rules_still_linked_to_previous',v_rules,
    'sector_calendars_requiring_review',v_sector_revisions,
    'duration_impact_verified',false,
    'observacao','Prévia de vínculos e intervalos candidatos; não comprova diferença de minutos nem alteração de alertas.'
  );
END $$;

-- Separate manager-only RPC rather than weakening the legacy calendar RPC.
-- The old versions, hours and exceptions are never updated or deleted.
CREATE FUNCTION public.dashboard_publish_calendar_successor(
  p_name text, p_effective_from date, p_effective_until date,
  p_periods jsonb, p_exceptions jsonb,
  p_expected_last_version integer, p_reason text
) RETURNS public.dashboard_work_calendar_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;
  v_previous public.dashboard_work_calendar_versions;
  v_calendar public.dashboard_work_calendar_versions;
  v_preview jsonb;
  v_record jsonb;
  v_weekday smallint;
  v_start time;
  v_end time;
  v_date date;
  v_working boolean;
  v_reason text;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 140 OR
     p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR
     p_effective_from IS NULL OR (p_effective_until IS NOT NULL AND p_effective_until<p_effective_from) OR
     p_periods IS NULL OR jsonb_typeof(p_periods)<>'array' OR
     jsonb_array_length(p_periods) NOT BETWEEN 1 AND 28 OR
     p_exceptions IS NULL OR jsonb_typeof(p_exceptions)<>'array' OR
     jsonb_array_length(p_exceptions)>3660 THEN
    RAISE EXCEPTION 'Parâmetros de sucessão inválidos'
      USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-calendar-publish',0)
  );
  -- The same global lock is used by the legacy RPC, preventing two managers
  -- from publishing overlapping successor versions concurrently.
  v_previous := public.dashboard_validate_calendar_successor_date(
    p_effective_from,p_expected_last_version
  );
  v_preview := public.dashboard_preview_calendar_successor(
    p_effective_from,p_expected_last_version
  );
  INSERT INTO public.dashboard_work_calendar_versions
    (version,name,time_zone,effective_from,effective_until,status,published_by,publication_reason)
  VALUES (v_previous.version+1,btrim(p_name),'America/Sao_Paulo',
          p_effective_from,p_effective_until,'published',v_actor,btrim(p_reason))
  RETURNING * INTO v_calendar;

  FOR v_record IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
    IF jsonb_typeof(v_record)<>'object' OR
       coalesce(v_record->>'weekday','') !~ '^[0-6]$' OR
       coalesce(v_record->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       coalesce(v_record->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Turno semanal malformado' USING ERRCODE='22023';
    END IF;
    v_weekday := (v_record->>'weekday')::smallint;
    v_start := (v_record->>'start')::time;
    v_end := (v_record->>'end')::time;
    IF v_end <= v_start OR EXISTS (
       SELECT 1 FROM public.dashboard_work_calendar_periods p
       WHERE p.calendar_version_id=v_calendar.id AND p.weekday=v_weekday
         AND v_start < p.ends_local AND v_end > p.starts_local
    ) THEN
       RAISE EXCEPTION 'Turnos semanais inválidos ou sobrepostos'
         USING ERRCODE='22023';
    END IF;
    INSERT INTO public.dashboard_work_calendar_periods
      (calendar_version_id,weekday,starts_local,ends_local)
    VALUES(v_calendar.id,v_weekday,v_start,v_end);
  END LOOP;

  FOR v_record IN SELECT value FROM jsonb_array_elements(p_exceptions) LOOP
    IF jsonb_typeof(v_record)<>'object' OR
       coalesce(v_record->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR
       jsonb_typeof(v_record->'working')<>'boolean' OR
       length(btrim(coalesce(v_record->>'reason',''))) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Exceção malformada' USING ERRCODE='22023';
    END IF;
    v_date := (v_record->>'date')::date;
    v_working := (v_record->>'working')::boolean;
    v_reason := v_record->>'reason';
    IF v_date<p_effective_from OR
       (p_effective_until IS NOT NULL AND v_date>p_effective_until) THEN
      RAISE EXCEPTION 'Exceção fora da vigência prospectiva'
        USING ERRCODE='22023';
    END IF;
    IF v_working THEN
      IF coalesce(v_record->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
         coalesce(v_record->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION 'Horário especial malformado' USING ERRCODE='22023';
      END IF;
      v_start:=(v_record->>'start')::time;
      v_end:=(v_record->>'end')::time;
      IF v_end<=v_start THEN RAISE EXCEPTION 'Horário especial inválido' USING ERRCODE='22023'; END IF;
    ELSE
      IF v_record->>'start' IS NOT NULL OR v_record->>'end' IS NOT NULL THEN
        RAISE EXCEPTION 'Folga integral não admite turnos' USING ERRCODE='22023';
      END IF;
      v_start:=NULL; v_end:=NULL;
    END IF;
    INSERT INTO public.dashboard_work_calendar_exceptions
      (calendar_version_id,exception_date,working,starts_local,ends_local,reason)
    VALUES(v_calendar.id,v_date,v_working,v_start,v_end,btrim(v_reason));
  END LOOP;

  INSERT INTO public.dashboard_calendar_succession_audit
    (previous_calendar_version_id,next_calendar_version_id,effective_from,
     changed_by,reason,preview)
  VALUES(v_previous.id,v_calendar.id,p_effective_from,v_actor,btrim(p_reason),v_preview);

  RETURN v_calendar;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_successor(date,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_publish_calendar_successor(
  text,date,date,jsonb,jsonb,integer,text
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_calendar_successor(date,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_publish_calendar_successor(
  text,date,date,jsonb,jsonb,integer,text
) TO authenticated;
