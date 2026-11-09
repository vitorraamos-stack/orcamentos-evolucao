-- Dashboard operacional 01–39 / Etapa 1 — calendários por setor.
-- PROPOSTA NÃO APLICADA: usar apenas após revisão e autorização expressa.
-- Cada publicação é um snapshot imutável; uma revisão posterior substitui a
-- anterior SOMENTE a partir de sua vigência, sem alterar os dados históricos.
CREATE TABLE public.dashboard_sector_calendar_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN (
    'ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  base_calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  effective_from date NOT NULL,
  effective_until date,
  mode text NOT NULL CHECK (mode IN ('inherit','override')),
  periods jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(periods)='array'),
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions)='array'),
  published_by uuid NOT NULL REFERENCES public.profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  UNIQUE (scope,base_calendar_version_id,revision),
  UNIQUE (scope,base_calendar_version_id,effective_from),
  CHECK(effective_until IS NULL OR effective_until >= effective_from)
);
CREATE INDEX dashboard_sector_calendar_lookup
  ON public.dashboard_sector_calendar_revisions
  (scope,base_calendar_version_id,effective_from DESC);

ALTER TABLE public.dashboard_sector_calendar_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_sector_calendar_revisions
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.dashboard_sector_calendar_revisions TO authenticated;
CREATE POLICY dashboard_sector_calendars_read
  ON public.dashboard_sector_calendar_revisions FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE TRIGGER dashboard_sector_calendar_revision_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_sector_calendar_revisions
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- A publicação exige uma revisão esperada, calendário global publicado,
-- vigência presente/futura, intervalos consistentes, justificativa e gestor.
CREATE FUNCTION public.dashboard_publish_sector_calendar(
  p_scope text,
  p_base_calendar_version_id uuid,
  p_effective_from date,
  p_effective_until date,
  p_mode text,
  p_periods jsonb,
  p_exceptions jsonb,
  p_expected_revision integer,
  p_reason text
) RETURNS public.dashboard_sector_calendar_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid;
  v_base public.dashboard_work_calendar_versions;
  v_last public.dashboard_sector_calendar_revisions;
  v_saved public.dashboard_sector_calendar_revisions;
  v_current_revision integer;
  v_row jsonb;
  v_seen jsonb := '[]'::jsonb;
  v_seen_exception_dates text[] := ARRAY[]::text[];
  v_weekday integer;
  v_start text;
  v_end text;
  v_date date;
  v_windows jsonb;
  v_window jsonb;
  v_window_seen jsonb;
  v_previous jsonb;
  v_reason text;
BEGIN
  v_actor := public.dashboard_assert_manager();
  IF p_scope IS NULL OR p_scope NOT IN (
      'ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')
     OR p_base_calendar_version_id IS NULL OR p_effective_from IS NULL
     OR p_effective_from < (now() AT TIME ZONE 'America/Sao_Paulo')::date
     OR (p_effective_until IS NOT NULL AND p_effective_until < p_effective_from)
     OR p_mode IS NULL OR p_mode NOT IN ('inherit','override')
     OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Parâmetros de calendário setorial inválidos ou retroativos'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_base FROM public.dashboard_work_calendar_versions
    WHERE id=p_base_calendar_version_id AND status='published';
  IF NOT FOUND OR p_effective_from < v_base.effective_from
     OR (v_base.effective_until IS NOT NULL AND
         (p_effective_from > v_base.effective_until OR
          p_effective_until IS NULL OR p_effective_until > v_base.effective_until)) THEN
    RAISE EXCEPTION 'Vigência fora do calendário padrão publicado'
      USING ERRCODE='22023';
  END IF;
  IF p_periods IS NULL OR jsonb_typeof(p_periods)<>'array'
     OR p_exceptions IS NULL OR jsonb_typeof(p_exceptions)<>'array'
     OR jsonb_array_length(p_periods)>28 OR jsonb_array_length(p_exceptions)>3660
     OR (p_mode='inherit' AND jsonb_array_length(p_periods)<>0)
     OR (p_mode='override' AND jsonb_array_length(p_periods)=0) THEN
    RAISE EXCEPTION 'Turnos e exceções setoriais inválidos' USING ERRCODE='22023';
  END IF;

  -- Turnos repetidos ou sobrepostos não podem compor um snapshot confiável.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
    IF jsonb_typeof(v_row)<>'object' OR
       NOT coalesce(v_row ? 'weekday',false) OR
       (v_row->>'weekday') !~ '^[0-6]$' OR
       coalesce(v_row->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       coalesce(v_row->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Intervalo setorial malformado' USING ERRCODE='22023';
    END IF;
    v_weekday:=(v_row->>'weekday')::integer;
    v_start:=v_row->>'start';
    v_end:=v_row->>'end';
    IF v_end<=v_start THEN RAISE EXCEPTION 'Turno com fim anterior ao início' USING ERRCODE='22023'; END IF;
    FOR v_previous IN SELECT value FROM jsonb_array_elements(v_seen) LOOP
      IF (v_previous->>'weekday')::integer=v_weekday
        AND v_start < (v_previous->>'end') AND v_end > (v_previous->>'start') THEN
        RAISE EXCEPTION 'Turnos setoriais sobrepostos' USING ERRCODE='22023';
      END IF;
    END LOOP;
    v_seen:=v_seen || jsonb_build_array(v_row);
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_exceptions) LOOP
    IF jsonb_typeof(v_row)<>'object'
      OR coalesce(v_row->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      OR coalesce(jsonb_typeof(v_row->'windows'),'')<>'array'
      OR jsonb_array_length(v_row->'windows')>6
      OR length(btrim(coalesce(v_row->>'reason',''))) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Exceção setorial malformada' USING ERRCODE='22023';
    END IF;
    v_date:=(v_row->>'date')::date;
    IF v_date<p_effective_from OR
       (p_effective_until IS NOT NULL AND v_date>p_effective_until) OR
       (v_base.effective_until IS NOT NULL AND v_date>v_base.effective_until) OR
       (v_row->>'date')=ANY(v_seen_exception_dates) THEN
      RAISE EXCEPTION 'Exceção duplicada ou fora da vigência' USING ERRCODE='22023';
    END IF;
    v_seen_exception_dates:=array_append(v_seen_exception_dates,v_row->>'date');
    v_windows:=v_row->'windows';
    v_window_seen:='[]'::jsonb;
    FOR v_window IN SELECT value FROM jsonb_array_elements(v_windows) LOOP
      IF jsonb_typeof(v_window)<>'object'
        OR coalesce(v_window->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR coalesce(v_window->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        OR (v_window->>'end') <= (v_window->>'start') THEN
        RAISE EXCEPTION 'Horário especial inválido' USING ERRCODE='22023';
      END IF;
      FOR v_previous IN SELECT value FROM jsonb_array_elements(v_window_seen) LOOP
        IF (v_window->>'start') < (v_previous->>'end') AND
           (v_window->>'end') > (v_previous->>'start') THEN
           RAISE EXCEPTION 'Turnos especiais sobrepostos' USING ERRCODE='22023';
        END IF;
      END LOOP;
      v_window_seen:=v_window_seen || jsonb_build_array(v_window);
    END LOOP;
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dashboard-sector-calendar:'||p_scope||':'||p_base_calendar_version_id::text,0));
  SELECT * INTO v_last FROM public.dashboard_sector_calendar_revisions
    WHERE scope=p_scope AND base_calendar_version_id=p_base_calendar_version_id
    ORDER BY revision DESC LIMIT 1 FOR UPDATE;
  v_current_revision:=coalesce(v_last.revision,0);
  IF v_current_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Calendário setorial alterado por outro gestor; atualize a prévia'
      USING ERRCODE='40001';
  END IF;
  IF v_current_revision>0 AND p_effective_from<=v_last.effective_from THEN
    RAISE EXCEPTION 'Nova revisão exige vigência posterior; correção retroativa usa fluxo específico'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.dashboard_sector_calendar_revisions
    (scope,base_calendar_version_id,revision,effective_from,effective_until,
     mode,periods,exceptions,published_by,reason)
  VALUES(p_scope,p_base_calendar_version_id,v_current_revision+1,
         p_effective_from,p_effective_until,p_mode,p_periods,p_exceptions,
         v_actor,btrim(p_reason))
  RETURNING * INTO v_saved;
  RETURN v_saved;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_publish_sector_calendar(
  text,uuid,date,date,text,jsonb,jsonb,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_publish_sector_calendar(
  text,uuid,date,date,text,jsonb,jsonb,integer,text)
  TO authenticated;
