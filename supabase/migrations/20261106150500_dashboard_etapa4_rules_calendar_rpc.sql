-- Dashboard Etapa 4 — publication RPCs. Protected by auth + serialized writes.
-- Dependências e regras SEM valores padrão. Não aplicar sem banco de homologação.
CREATE FUNCTION public.dashboard_assert_manager() RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL OR NOT public.has_module_access(v_user,'hub_os')
    OR NOT public.is_manager(v_user) THEN
   RAISE EXCEPTION 'Gestor do Hub OS obrigatório' USING ERRCODE='42501';
 END IF;
 RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_assert_manager() FROM PUBLIC,anon,authenticated;

-- A mesma validação alimenta prévia e gravação; não aceitar regras cujas
-- fontes ainda não existem nas tabelas de responsáveis e prazos.
CREATE FUNCTION public.dashboard_validate_rule(
 p_scope text, p_owner text, p_deadline text, p_condition_logistic_type text,
 p_stalled_limit_minutes integer, p_calendar_version_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_published boolean;
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN
    ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS') THEN
   RAISE EXCEPTION 'Escopo operacional inválido' USING ERRCODE='22023';
 END IF;
 IF p_owner IS NULL OR p_owner NOT IN ('required','optional','conditional') OR
    p_deadline IS NULL OR p_deadline NOT IN ('required','optional','conditional') THEN
   RAISE EXCEPTION 'Exigência operacional inválida' USING ERRCODE='22023';
 END IF;
 IF (p_owner='conditional' OR p_deadline='conditional') THEN
   IF p_condition_logistic_type IS NULL OR p_condition_logistic_type NOT IN
      ('retirada','entrega','instalacao') THEN
     RAISE EXCEPTION 'Condição logística inválida' USING ERRCODE='22023';
   END IF;
 ELSIF p_condition_logistic_type IS NOT NULL THEN
   RAISE EXCEPTION 'Condição logística não aplicável' USING ERRCODE='22023';
 END IF;
 IF (p_scope='APPROVAL' AND p_owner <> 'optional') OR
    (p_scope='LOGISTICS' AND (p_owner <> 'optional' OR p_deadline <> 'optional')) THEN
   RAISE EXCEPTION 'Não existe fonte verificável para esta exigência' USING ERRCODE='22023';
 END IF;
 IF p_stalled_limit_minutes IS NOT NULL AND (p_stalled_limit_minutes <= 0 OR p_calendar_version_id IS NULL) THEN
   RAISE EXCEPTION 'Limite exige calendário publicado e valor positivo' USING ERRCODE='22023';
 END IF;
 IF p_calendar_version_id IS NOT NULL THEN
   SELECT (v.status='published') INTO v_published
     FROM public.dashboard_work_calendar_versions v WHERE v.id=p_calendar_version_id;
   IF NOT coalesce(v_published,false) THEN
     RAISE EXCEPTION 'Calendário não publicado' USING ERRCODE='22023';
   END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_validate_rule(text,text,text,text,integer,uuid)
 FROM PUBLIC,anon,authenticated;

-- Prévia consultiva, restrita a gestores. Não supõe jornada nem infração
-- para logística/aprovação sem fonte; contagens calculadas a partir das OS.
CREATE FUNCTION public.dashboard_preview_rule_impact(
 p_scope text, p_owner text, p_deadline text, p_condition_logistic_type text DEFAULT NULL,
 p_stalled_limit_minutes integer DEFAULT NULL, p_calendar_version_id uuid DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_considered integer; v_no_owner integer; v_no_deadline integer;
BEGIN
 PERFORM public.dashboard_assert_manager();
 PERFORM public.dashboard_validate_rule(p_scope,p_owner,p_deadline,p_condition_logistic_type,p_stalled_limit_minutes,p_calendar_version_id);
 WITH scoped AS (
   SELECT o.id, o.logistic_type,
     ((p_owner='required') OR (p_owner='conditional' AND o.logistic_type=p_condition_logistic_type)) AS require_owner,
     ((p_deadline='required') OR (p_deadline='conditional' AND o.logistic_type=p_condition_logistic_type)) AS require_deadline
   FROM public.os_orders o
   WHERE NOT o.archived AND o.prod_status IS DISTINCT FROM 'Finalizados'
     AND (CASE
       WHEN o.prod_status='Instalação Agendada' THEN 'INSTALLATION'
       WHEN o.prod_status='Logística (Entrega/Transportadora)' THEN 'LOGISTICS'
       WHEN o.prod_status='Em Acabamento' THEN 'FINISHING'
       WHEN o.prod_status IN ('Produção','Pronto / Avisar Cliente') THEN 'PRODUCTION'
       WHEN o.art_status='Para Aprovação' THEN 'APPROVAL'
       ELSE 'ART'
     END)=p_scope
 )
 SELECT count(*)::int,
   count(*) FILTER (WHERE require_owner AND NOT EXISTS (
     SELECT 1 FROM public.os_order_assignees a
     WHERE a.order_id=scoped.id AND a.user_id IS NOT NULL
       AND a.scope IN (p_scope, 'GENERAL')
   ))::int,
   count(*) FILTER (WHERE require_deadline AND NOT EXISTS (
     SELECT 1 FROM public.os_order_deadlines d
     WHERE d.order_id=scoped.id AND d.scope=p_scope
   ))::int
 INTO v_considered,v_no_owner,v_no_deadline FROM scoped;
 RETURN jsonb_build_object('scope',p_scope,'os_consultadas',v_considered,
   'sem_responsavel',v_no_owner,'sem_prazo',v_no_deadline,
   'duracao_verificada',false,'observacao','Prévia do instante atual; revalidar antes da publicação.');
END $$;

-- Publicação de regra transacional: optimistic lock, auditoria e calendário
-- validado no servidor. A primeira publicação exige revision=0.
CREATE FUNCTION public.dashboard_publish_rule(
 p_scope text, p_owner text, p_deadline text,
 p_condition_logistic_type text, p_stalled_limit_minutes integer,
 p_calendar_version_id uuid, p_expected_revision integer,
 p_reason text
) RETURNS public.dashboard_operational_rules
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_row public.dashboard_operational_rules;
        v_before jsonb; v_revision integer; v_verified boolean;
BEGIN
 v_actor:=public.dashboard_assert_manager();
 IF p_expected_revision IS NULL OR p_expected_revision < 0 OR
    p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
   RAISE EXCEPTION 'Revisão esperada e justificativa são obrigatórias' USING ERRCODE='22023';
 END IF;
 PERFORM public.dashboard_validate_rule(p_scope,p_owner,p_deadline,p_condition_logistic_type,p_stalled_limit_minutes,p_calendar_version_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dashboard-rule:'||p_scope,0));
 SELECT * INTO v_row FROM public.dashboard_operational_rules r
   WHERE r.scope=p_scope FOR UPDATE;
 v_revision:=coalesce(v_row.revision,0);
 IF v_revision <> p_expected_revision THEN
   RAISE EXCEPTION 'Regra alterada por outro gestor; atualize a prévia' USING ERRCODE='40001';
 END IF;
 v_before:=CASE WHEN v_revision=0 THEN NULL ELSE to_jsonb(v_row) END;
 v_verified:=p_calendar_version_id IS NOT NULL;
 IF v_revision=0 THEN
   INSERT INTO public.dashboard_operational_rules
    (scope,owner,deadline,condition_logistic_type,stalled_limit_minutes,
     calendar_version_id,calendar_verified,revision,effective_from,updated_by)
   VALUES(p_scope,p_owner,p_deadline,p_condition_logistic_type,p_stalled_limit_minutes,
     p_calendar_version_id,v_verified,1,now(),v_actor)
   RETURNING * INTO v_row;
 ELSE
   UPDATE public.dashboard_operational_rules SET
     owner=p_owner,deadline=p_deadline,condition_logistic_type=p_condition_logistic_type,
     stalled_limit_minutes=p_stalled_limit_minutes,calendar_version_id=p_calendar_version_id,
     calendar_verified=v_verified,revision=v_revision+1,updated_at=now(),
     effective_from=now(),updated_by=v_actor
   WHERE id=v_row.id RETURNING * INTO v_row;
 END IF;
 INSERT INTO public.dashboard_operational_rule_revisions
   (rule_id,revision,previous_rule,published_rule,changed_by,reason)
 VALUES(v_row.id,v_row.revision,v_before,to_jsonb(v_row),v_actor,btrim(p_reason));
 RETURN v_row;
END $$;

-- Publicação de calendário com versão monotônica, sem backfill, horário
-- semanal explícito, feriados/exceções explícitos e proteção de overlap.
CREATE FUNCTION public.dashboard_publish_calendar(
 p_name text, p_effective_from date, p_effective_until date,
 p_periods jsonb, p_exceptions jsonb,
 p_expected_last_version integer, p_reason text
) RETURNS public.dashboard_work_calendar_versions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_version integer; v_calendar public.dashboard_work_calendar_versions;
        v_record jsonb; v_weekday smallint; v_start time; v_end time;
        v_date date; v_working boolean; v_reason text; v_total integer:=0;
BEGIN
 v_actor:=public.dashboard_assert_manager();
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 140 OR
    p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR
    p_effective_from IS NULL OR (p_effective_until IS NOT NULL AND p_effective_until<p_effective_from) OR
    p_expected_last_version IS NULL OR p_expected_last_version<0 THEN
   RAISE EXCEPTION 'Parâmetros de calendário inválidos' USING ERRCODE='22023';
 END IF;
 IF p_periods IS NULL OR jsonb_typeof(p_periods)<>'array' OR
    jsonb_array_length(p_periods) NOT BETWEEN 1 AND 28 OR
    p_exceptions IS NULL OR jsonb_typeof(p_exceptions)<>'array' OR
    jsonb_array_length(p_exceptions)>3660 THEN
   RAISE EXCEPTION 'Jornada semanal e exceções precisam ser listas válidas' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dashboard-calendar-publish',0));
 SELECT coalesce(max(version),0) INTO v_version FROM public.dashboard_work_calendar_versions;
 IF v_version<>p_expected_last_version THEN
   RAISE EXCEPTION 'Calendário alterado por outro gestor; atualize a prévia' USING ERRCODE='40001';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dashboard_work_calendar_versions c
   WHERE c.effective_from >= p_effective_from) THEN
   RAISE EXCEPTION 'A nova versão não pode retroagir a um calendário já publicado' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM public.dashboard_work_calendar_versions c
   WHERE c.effective_until IS NULL OR c.effective_until >= p_effective_from) THEN
   RAISE EXCEPTION 'A nova jornada não pode sobrepor uma versão vigente' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.dashboard_work_calendar_versions
   (version,name,time_zone,effective_from,effective_until,status,published_by,publication_reason)
 VALUES(v_version+1,btrim(p_name),'America/Sao_Paulo',
   p_effective_from,p_effective_until,'published',v_actor,btrim(p_reason))
 RETURNING * INTO v_calendar;

 FOR v_record IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
   IF jsonb_typeof(v_record)<>'object' THEN
     RAISE EXCEPTION 'Período semanal malformado' USING ERRCODE='22023';
   END IF;
   v_weekday:=(v_record->>'weekday')::smallint;
   v_start:=(v_record->>'start')::time;
   v_end:=(v_record->>'end')::time;
   IF v_weekday IS NULL OR v_weekday NOT BETWEEN 0 AND 6 OR
      v_start IS NULL OR v_end IS NULL OR v_end<=v_start THEN
     RAISE EXCEPTION 'Intervalo semanal inválido' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.dashboard_work_calendar_periods p
     WHERE p.calendar_version_id=v_calendar.id AND p.weekday=v_weekday
       AND v_start<p.ends_local AND v_end>p.starts_local) THEN
     RAISE EXCEPTION 'Turnos sobrepostos no mesmo dia' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.dashboard_work_calendar_periods
     (calendar_version_id,weekday,starts_local,ends_local)
   VALUES(v_calendar.id,v_weekday,v_start,v_end);
   v_total:=v_total+1;
 END LOOP;
 IF v_total=0 THEN RAISE EXCEPTION 'Calendário sem jornada' USING ERRCODE='22023'; END IF;

 FOR v_record IN SELECT value FROM jsonb_array_elements(p_exceptions) LOOP
   IF jsonb_typeof(v_record)<>'object' THEN RAISE EXCEPTION 'Exceção malformada' USING ERRCODE='22023'; END IF;
   v_date:=(v_record->>'date')::date;
   v_working:=(v_record->>'working')::boolean;
   v_start:=(v_record->>'start')::time;
   v_end:=(v_record->>'end')::time;
   v_reason:=v_record->>'reason';
   IF v_date IS NULL OR v_date<p_effective_from OR
      (p_effective_until IS NOT NULL AND v_date>p_effective_until) OR
      v_working IS NULL OR v_reason IS NULL OR length(btrim(v_reason)) NOT BETWEEN 1 AND 500 OR
      (v_working AND (v_start IS NULL OR v_end IS NULL OR v_end<=v_start)) OR
      (NOT v_working AND (v_start IS NOT NULL OR v_end IS NOT NULL)) THEN
     RAISE EXCEPTION 'Feriado/exceção inválido' USING ERRCODE='22023';
   END IF;
   INSERT INTO public.dashboard_work_calendar_exceptions
     (calendar_version_id,exception_date,working,starts_local,ends_local,reason)
   VALUES(v_calendar.id,v_date,v_working,v_start,v_end,btrim(v_reason));
 END LOOP;
 RETURN v_calendar;
END $$;

-- Hardening: funções internas inacessíveis por chamada pública.
REVOKE ALL ON FUNCTION public.dashboard_preview_rule_impact(text,text,text,text,integer,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_publish_rule(text,text,text,text,integer,uuid,integer,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_publish_calendar(text,date,date,jsonb,jsonb,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_rule_impact(text,text,text,text,integer,uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_publish_rule(text,text,text,text,integer,uuid,integer,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_publish_calendar(text,date,date,jsonb,jsonb,integer,text)
 TO authenticated;
