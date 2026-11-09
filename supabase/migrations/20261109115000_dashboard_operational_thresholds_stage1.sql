-- Dashboard operacional / novas decisões 01–39: limites duplos por setor.
-- MIGRATION PROPOSTA: NÃO APLICADA no Supabase de produção.
-- A tabela atual dashboard_operational_rules permanece compatível; limites
-- históricos stalled_limit_minutes são preservados até migração controlada.
CREATE TABLE public.dashboard_operational_thresholds (
  scope text PRIMARY KEY CHECK(scope IN ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  attention_limit_minutes integer NOT NULL CHECK(attention_limit_minutes > 0),
  critical_limit_minutes integer NOT NULL CHECK(critical_limit_minutes > attention_limit_minutes),
  calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES public.profiles(id)
);

CREATE TABLE public.dashboard_operational_threshold_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK(scope IN ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  revision integer NOT NULL CHECK(revision > 0),
  previous_values jsonb,
  published_values jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
  UNIQUE(scope,revision)
);

CREATE INDEX dashboard_threshold_history_lookup
  ON public.dashboard_operational_threshold_revisions(scope,changed_at DESC);

ALTER TABLE public.dashboard_operational_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operational_threshold_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_operational_thresholds,public.dashboard_operational_threshold_revisions
  FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.dashboard_operational_thresholds,public.dashboard_operational_threshold_revisions
  TO authenticated;
CREATE POLICY dashboard_threshold_read ON public.dashboard_operational_thresholds
  FOR SELECT TO authenticated USING(public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_threshold_history_read ON public.dashboard_operational_threshold_revisions
  FOR SELECT TO authenticated USING(public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE TRIGGER dashboard_threshold_history_immutable
  BEFORE UPDATE OR DELETE ON public.dashboard_operational_threshold_revisions
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();

-- Validação central: os mesmos critérios são exigidos na prévia e publicação.
CREATE FUNCTION public.dashboard_validate_thresholds(
  p_scope text,p_attention_minutes integer,p_critical_minutes integer,p_calendar_version_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')
    OR p_attention_minutes IS NULL OR p_critical_minutes IS NULL OR
    p_attention_minutes<=0 OR p_critical_minutes<=p_attention_minutes OR p_calendar_version_id IS NULL THEN
    RAISE EXCEPTION 'Escopo, calendário ou limites Atenção/Crítico inválidos' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.dashboard_work_calendar_versions c
    WHERE c.id=p_calendar_version_id AND c.status='published') THEN
    RAISE EXCEPTION 'Calendário não publicado' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.dashboard_validate_thresholds(text,integer,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Prévia conservadora: não inventa número de alertas enquanto durações não
-- forem verificáveis. A aplicação também exibe a simulação local sobre
-- evidências verificadas, quando estas existirem.
CREATE FUNCTION public.dashboard_preview_thresholds(
  p_scope text,p_attention_minutes integer,p_critical_minutes integer,p_calendar_version_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_considered integer; v_verified integer;
BEGIN
 PERFORM public.dashboard_assert_manager();
 PERFORM public.dashboard_validate_thresholds(p_scope,p_attention_minutes,p_critical_minutes,p_calendar_version_id);
 WITH orders AS (
   SELECT o.id FROM public.os_orders o
   WHERE NOT o.archived AND o.prod_status IS DISTINCT FROM 'Finalizados'
     AND CASE
       WHEN o.prod_status='Instalação Agendada' THEN 'INSTALLATION'
       WHEN o.prod_status='Logística (Entrega/Transportadora)' THEN 'LOGISTICS'
       WHEN o.prod_status='Em Acabamento' THEN 'FINISHING'
       WHEN o.prod_status IN ('Produção','Pronto / Avisar Cliente') THEN 'PRODUCTION'
       WHEN o.art_status='Para Aprovação' THEN 'APPROVAL'
       ELSE 'ART' END = p_scope
 )
 SELECT count(*)::integer,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.dashboard_stage_intervals i
          WHERE i.order_id=orders.id AND i.scope=p_scope
            AND i.left_at IS NULL AND i.evidence_state='verified'
            AND i.calendar_version_id=p_calendar_version_id
            AND i.entered_at >= (
              SELECT effective_from FROM public.dashboard_work_calendar_versions
              WHERE id=p_calendar_version_id
            )::timestamptz
        ))::integer
 INTO v_considered,v_verified FROM orders;
 RETURN jsonb_build_object(
   'scope',p_scope,'os_consultadas',v_considered,
   'intervalos_candidatos',v_verified,
   'impacto_verificado',false,
   'observacao','Prévia informativa: intervalos candidatos não comprovam duração. A contagem de alertas exige cálculo completo no frontend com evidência verificável.'
 );
END $$;

CREATE FUNCTION public.dashboard_publish_thresholds(
  p_scope text,p_attention_minutes integer,p_critical_minutes integer,
  p_calendar_version_id uuid,p_expected_revision integer,p_reason text
) RETURNS public.dashboard_operational_thresholds
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_before jsonb; v_current public.dashboard_operational_thresholds;
        v_row public.dashboard_operational_thresholds; v_revision integer;
BEGIN
 v_actor:=public.dashboard_assert_manager();
 PERFORM public.dashboard_validate_thresholds(p_scope,p_attention_minutes,p_critical_minutes,p_calendar_version_id);
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR
    p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Revisão esperada e justificativa obrigatórias' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dashboard-thresholds:'||p_scope,0));
 SELECT * INTO v_current FROM public.dashboard_operational_thresholds
   WHERE scope=p_scope FOR UPDATE;
 v_revision:=coalesce(v_current.revision,0);
 IF v_revision<>p_expected_revision THEN
   RAISE EXCEPTION 'Limites alterados por outro gestor; atualize a prévia' USING ERRCODE='40001';
 END IF;
 v_before:=CASE WHEN v_revision=0 THEN NULL ELSE to_jsonb(v_current) END;
 IF v_revision=0 THEN
   INSERT INTO public.dashboard_operational_thresholds
      (scope,attention_limit_minutes,critical_limit_minutes,calendar_version_id,revision,updated_by)
   VALUES(p_scope,p_attention_minutes,p_critical_minutes,p_calendar_version_id,1,v_actor)
   RETURNING * INTO v_row;
 ELSE
   UPDATE public.dashboard_operational_thresholds SET
      attention_limit_minutes=p_attention_minutes,critical_limit_minutes=p_critical_minutes,
      calendar_version_id=p_calendar_version_id,revision=v_revision+1,
      effective_from=now(),updated_at=now(),updated_by=v_actor
   WHERE scope=p_scope RETURNING * INTO v_row;
 END IF;
 INSERT INTO public.dashboard_operational_threshold_revisions
   (scope,revision,previous_values,published_values,changed_by,reason)
 VALUES(p_scope,v_row.revision,v_before,to_jsonb(v_row),v_actor,btrim(p_reason));
 RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_preview_thresholds(text,integer,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.dashboard_publish_thresholds(text,integer,integer,uuid,integer,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_preview_thresholds(text,integer,integer,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_publish_thresholds(text,integer,integer,uuid,integer,text)
  TO authenticated;
