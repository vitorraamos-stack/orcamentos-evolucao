-- Dashboard Etapa 4 — captura de transições reais de etapa e bloqueios de operação.
-- Não retroprojeta datas históricas nem cria fixtures. OS já existentes passam a
-- registrar evidência somente a partir da primeira transição observada.
CREATE OR REPLACE FUNCTION public.dashboard_order_operational_scope(
  p_art_status text, p_prod_status text, p_archived boolean
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=''
AS $dashboard_scope$
  SELECT CASE
    WHEN coalesce(p_archived,false) OR p_prod_status='Finalizados' THEN NULL
    WHEN p_prod_status='Instalação Agendada' THEN 'INSTALLATION'
    WHEN p_prod_status='Logística (Entrega/Transportadora)' THEN 'LOGISTICS'
    WHEN p_prod_status='Em Acabamento' THEN 'FINISHING'
    WHEN p_prod_status IN ('Produção','Pronto / Avisar Cliente') THEN 'PRODUCTION'
    WHEN p_prod_status IS NULL AND p_art_status='Para Aprovação' THEN 'APPROVAL'
    WHEN p_prod_status IS NULL THEN 'ART'
    ELSE NULL
  END;
$dashboard_scope$;

REVOKE ALL ON FUNCTION public.dashboard_order_operational_scope(text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

-- Abre um intervalo com o contexto de regra/calendário vigente no instante
-- observado. Evidência unverified é usada somente como marco inicial em OS
-- antigas sem histórico; nunca deve alimentar cálculo de duração.
CREATE OR REPLACE FUNCTION public.dashboard_open_stage_interval(
  p_order_id uuid, p_scope text, p_entered_at timestamptz, p_evidence_state text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $dashboard_open$
DECLARE
  v_calendar_id uuid;
  v_rule_revision_id uuid;
  v_interval_id uuid;
  v_local_date date := (p_entered_at AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF p_order_id IS NULL OR p_scope IS NULL OR p_scope NOT IN
    ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS') OR
    p_entered_at IS NULL OR p_evidence_state IS NULL OR p_evidence_state NOT IN ('verified','unverified') THEN
    RAISE EXCEPTION 'Contexto de intervalo operacional inválido' USING ERRCODE='22023';
  END IF;

  SELECT r.calendar_version_id, rev.id
    INTO v_calendar_id, v_rule_revision_id
  FROM public.dashboard_operational_rules r
  LEFT JOIN public.dashboard_operational_rule_revisions rev
    ON rev.rule_id=r.id AND rev.revision=r.revision
  WHERE r.scope=p_scope AND r.effective_from<=p_entered_at
  ORDER BY r.revision DESC
  LIMIT 1;

  IF v_calendar_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dashboard_work_calendar_versions c
    WHERE c.id=v_calendar_id
      AND c.effective_from<=v_local_date
      AND (c.effective_until IS NULL OR c.effective_until>=v_local_date)
  ) THEN
    v_calendar_id:=NULL;
  END IF;

  INSERT INTO public.dashboard_stage_intervals(
    order_id,scope,entered_at,calendar_version_id,rule_revision_id,
    evidence_state,source_event_id,recorded_at,recorded_by
  )
  VALUES(
    p_order_id,p_scope,p_entered_at,v_calendar_id,v_rule_revision_id,
    p_evidence_state,NULL,clock_timestamp(),auth.uid()
  )
  RETURNING id INTO v_interval_id;

  RETURN v_interval_id;
END;
$dashboard_open$;

REVOKE ALL ON FUNCTION public.dashboard_open_stage_interval(uuid,text,timestamptz,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dashboard_capture_order_stage_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $dashboard_order_stage$
DECLARE
  v_old_scope text;
  v_new_scope text;
  v_now timestamptz := clock_timestamp();
  v_has_open_interval boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    v_old_scope:=NULL;
  ELSE
    v_old_scope:=public.dashboard_order_operational_scope(
      OLD.art_status,OLD.prod_status,OLD.archived
    );
  END IF;

  v_new_scope:=public.dashboard_order_operational_scope(
    NEW.art_status,NEW.prod_status,NEW.archived
  );

  -- Serializa criação/fechamento de intervalos para a mesma OS.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dashboard-stage:'||NEW.id::text,0)
  );

  IF TG_OP='UPDATE' AND v_old_scope IS NOT DISTINCT FROM v_new_scope THEN
    IF v_new_scope IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.dashboard_stage_intervals i
        WHERE i.order_id=NEW.id AND i.left_at IS NULL
      ) INTO v_has_open_interval;

      -- Para OS que já existiam antes da instrumentação, o primeiro update
      -- observado marca somente o início da coleta; não afirma quando a etapa começou.
      IF NOT v_has_open_interval THEN
        PERFORM public.dashboard_open_stage_interval(
          NEW.id,v_new_scope,v_now,'unverified'
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Uma troca de etapa encerra pausas e intervalos abertos anteriores.
  UPDATE public.dashboard_stage_pauses p
    SET ended_at=v_now
  FROM public.dashboard_stage_intervals i
  WHERE p.stage_interval_id=i.id
    AND i.order_id=NEW.id
    AND p.ended_at IS NULL;

  UPDATE public.dashboard_stage_intervals
    SET left_at=v_now
  WHERE order_id=NEW.id AND left_at IS NULL;

  IF v_new_scope IS NOT NULL THEN
    PERFORM public.dashboard_open_stage_interval(
      NEW.id,v_new_scope,v_now,'verified'
    );
  END IF;

  RETURN NEW;
END;
$dashboard_order_stage$;

REVOKE ALL ON FUNCTION public.dashboard_capture_order_stage_transition()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER dashboard_stage_interval_order_transition
AFTER INSERT OR UPDATE OF art_status,prod_status,archived
ON public.os_orders
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_capture_order_stage_transition();

-- Um status BLOCKED gera pausa somente quando existe intervalo de etapa aberto.
-- A saída do bloqueio, exclusão lógica/física ou movimentação do item encerra a pausa.
CREATE OR REPLACE FUNCTION public.dashboard_capture_operation_pause()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $dashboard_operation_pause$
DECLARE
  v_old_order_id uuid;
  v_new_order_id uuid;
  v_interval_id uuid;
  v_now timestamptz := clock_timestamp();
  v_should_open boolean := false;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT item.order_id INTO v_old_order_id
    FROM public.os_order_items item WHERE item.id=OLD.item_id;
    IF v_old_order_id IS NOT NULL THEN
      PERFORM 1 FROM public.os_orders o WHERE o.id=v_old_order_id FOR UPDATE;
    END IF;
    UPDATE public.dashboard_stage_pauses
      SET ended_at=coalesce(ended_at,v_now)
    WHERE operation_id=OLD.id AND ended_at IS NULL;
    RETURN OLD;
  END IF;

  IF TG_OP='UPDATE' THEN
    SELECT item.order_id INTO v_old_order_id
    FROM public.os_order_items item WHERE item.id=OLD.item_id;

    IF OLD.status='BLOCKED' AND (
      NEW.status IS DISTINCT FROM 'BLOCKED' OR
      OLD.item_id IS DISTINCT FROM NEW.item_id OR
      (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    ) THEN
      IF v_old_order_id IS NOT NULL THEN
        PERFORM 1 FROM public.os_orders o WHERE o.id=v_old_order_id FOR UPDATE;
      END IF;
      UPDATE public.dashboard_stage_pauses
        SET ended_at=coalesce(ended_at,v_now)
      WHERE operation_id=OLD.id AND ended_at IS NULL;
    END IF;

    v_should_open:=NEW.status='BLOCKED' AND NEW.deleted_at IS NULL AND (
      OLD.status IS DISTINCT FROM 'BLOCKED' OR
      OLD.item_id IS DISTINCT FROM NEW.item_id OR
      (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
    );
  ELSE
    v_should_open:=NEW.status='BLOCKED' AND NEW.deleted_at IS NULL;
  END IF;

  IF v_should_open THEN
    SELECT item.order_id INTO v_new_order_id
    FROM public.os_order_items item
    WHERE item.id=NEW.item_id
      AND item.deleted_at IS NULL
      AND item.status<>'CANCELLED';

    IF v_new_order_id IS NOT NULL THEN
      PERFORM 1 FROM public.os_orders o WHERE o.id=v_new_order_id FOR UPDATE;

      SELECT i.id INTO v_interval_id
      FROM public.dashboard_stage_intervals i
      WHERE i.order_id=v_new_order_id AND i.left_at IS NULL
      ORDER BY i.entered_at DESC
      LIMIT 1
      FOR UPDATE;

      IF v_interval_id IS NOT NULL THEN
        INSERT INTO public.dashboard_stage_pauses(
          stage_interval_id,operation_id,started_at,ended_at,reason,
          evidence_state,recorded_at,recorded_by
        )
        VALUES(
          v_interval_id,NEW.id,v_now,NULL,
          CASE WHEN length(btrim(coalesce(NEW.blocked_reason,''))) BETWEEN 3 AND 1000
            THEN btrim(NEW.blocked_reason)
            ELSE 'Bloqueio sem justificativa registrada' END,
          'verified',clock_timestamp(),auth.uid()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$dashboard_operation_pause$;

REVOKE ALL ON FUNCTION public.dashboard_capture_operation_pause()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER dashboard_stage_pause_operation_status
BEFORE INSERT OR UPDATE OF status,item_id,deleted_at OR DELETE
ON public.os_order_item_operations
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_capture_operation_pause();



-- Cancelamento, exclusão lógica/física ou movimentação de item encerra
-- pausas das operações pertencentes a esse item.
CREATE OR REPLACE FUNCTION public.dashboard_close_item_operation_pauses()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $dashboard_item_pause$
DECLARE
  v_should_close boolean := false;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF TG_OP='DELETE' THEN
    v_should_close:=true;
  ELSE
    v_should_close:=
      (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR
      (OLD.status IS DISTINCT FROM 'CANCELLED' AND NEW.status='CANCELLED') OR
      OLD.order_id IS DISTINCT FROM NEW.order_id;
  END IF;

  IF v_should_close THEN
    PERFORM 1 FROM public.os_orders o WHERE o.id=OLD.order_id FOR UPDATE;
    UPDATE public.dashboard_stage_pauses p
      SET ended_at=coalesce(p.ended_at,v_now)
    WHERE p.ended_at IS NULL
      AND p.operation_id IN (
        SELECT op.id FROM public.os_order_item_operations op WHERE op.item_id=OLD.id
      );
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$dashboard_item_pause$;

REVOKE ALL ON FUNCTION public.dashboard_close_item_operation_pauses()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER dashboard_stage_pause_item_change
BEFORE UPDATE OF status,deleted_at,order_id OR DELETE
ON public.os_order_items
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_close_item_operation_pauses();

COMMENT ON FUNCTION public.dashboard_order_operational_scope(text,text,boolean) IS
  'Mapeia status reais da OS para os escopos operacionais da Etapa 4.';
COMMENT ON FUNCTION public.dashboard_capture_order_stage_transition() IS
  'Registra transições de etapa após INSERT/UPDATE real; OS antigas recebem marco inicial unverified, sem retroprojeção.';
COMMENT ON FUNCTION public.dashboard_capture_operation_pause() IS
  'Registra pausas verificadas quando operações entram/saem de BLOCKED e existe intervalo de etapa aberto.';
