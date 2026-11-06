-- Dashboard Etapa 4 — dependências explícitas geridas exclusivamente por RPCs.
-- Lock por OS, checagem de atividade existente/ativa, prevenção de ciclo e
-- auditoria de alterações e exclusões lógicas/físicas.
CREATE FUNCTION public.dashboard_link_operations(
 p_order_id uuid, p_predecessor_id uuid, p_successor_id uuid, p_reason text
) RETURNS public.os_item_operation_dependencies
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_before uuid; v_after uuid; v_order_id uuid;
        v_cycle boolean; v_existing boolean; v_link public.os_item_operation_dependencies;
BEGIN
 v_actor:=public.dashboard_assert_manager();
 IF p_order_id IS NULL OR p_predecessor_id IS NULL OR p_successor_id IS NULL OR
    p_predecessor_id=p_successor_id OR p_reason IS NULL OR
    length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
   RAISE EXCEPTION 'Dados de dependência inválidos' USING ERRCODE='22023';
 END IF;
 -- Serializa duas edições concorrentes da mesma OS.
 SELECT o.id INTO v_order_id FROM public.os_orders o
   WHERE o.id=p_order_id AND NOT o.archived
     AND o.prod_status IS DISTINCT FROM 'Finalizados'
   FOR UPDATE;
 IF v_order_id IS NULL THEN
   RAISE EXCEPTION 'OS inexistente, arquivada ou finalizada' USING ERRCODE='P0002';
 END IF;
 SELECT item.order_id INTO v_before FROM public.os_order_item_operations op
   JOIN public.os_order_items item ON item.id=op.item_id
   WHERE op.id=p_predecessor_id AND op.deleted_at IS NULL
     AND item.deleted_at IS NULL AND item.status<>'CANCELLED';
 SELECT item.order_id INTO v_after FROM public.os_order_item_operations op
   JOIN public.os_order_items item ON item.id=op.item_id
   WHERE op.id=p_successor_id AND op.deleted_at IS NULL
     AND item.deleted_at IS NULL AND item.status<>'CANCELLED';
 IF v_before IS DISTINCT FROM p_order_id OR v_after IS DISTINCT FROM p_order_id THEN
   RAISE EXCEPTION 'Ambas as atividades devem estar ativas na mesma OS' USING ERRCODE='22023';
 END IF;
 SELECT EXISTS(
   SELECT 1 FROM public.os_item_operation_dependencies d
    WHERE d.order_id=p_order_id AND d.predecessor_operation_id=p_predecessor_id
      AND d.successor_operation_id=p_successor_id
 ) INTO v_existing;
 IF v_existing THEN RAISE EXCEPTION 'Dependência já registrada' USING ERRCODE='23505'; END IF;

 -- Uma relação nova (A -> B) criaria ciclo se B já alcançasse A.
 WITH RECURSIVE reachable(id) AS (
   SELECT p_successor_id
   UNION
   SELECT d.successor_operation_id FROM public.os_item_operation_dependencies d
     JOIN reachable r ON d.predecessor_operation_id=r.id
     WHERE d.order_id=p_order_id
 )
 SELECT EXISTS (SELECT 1 FROM reachable WHERE id=p_predecessor_id) INTO v_cycle;
 IF v_cycle THEN RAISE EXCEPTION 'Dependência criaria um ciclo' USING ERRCODE='22023'; END IF;

 INSERT INTO public.os_item_operation_dependencies
   (order_id,predecessor_operation_id,successor_operation_id,created_by)
 VALUES(p_order_id,p_predecessor_id,p_successor_id,v_actor)
 RETURNING * INTO v_link;
 INSERT INTO public.dashboard_operation_dependency_audit
   (dependency_id,order_id,predecessor_operation_id,successor_operation_id,
     action,changed_by,reason)
 VALUES(v_link.id,v_link.order_id,v_link.predecessor_operation_id,
   v_link.successor_operation_id,'CREATED',v_actor,btrim(p_reason));
 RETURN v_link;
END $$;

CREATE FUNCTION public.dashboard_unlink_operations(
 p_dependency_id uuid, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_link public.os_item_operation_dependencies; v_order uuid;
BEGIN
 v_actor:=public.dashboard_assert_manager();
 IF p_dependency_id IS NULL OR p_reason IS NULL OR
    length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
   RAISE EXCEPTION 'Justificativa de remoção inválida' USING ERRCODE='22023';
 END IF;
 SELECT d.order_id INTO v_order FROM public.os_item_operation_dependencies d
   WHERE d.id=p_dependency_id;
 IF v_order IS NULL THEN RAISE EXCEPTION 'Dependência inexistente' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.os_orders o WHERE o.id=v_order FOR UPDATE;
 SELECT * INTO v_link FROM public.os_item_operation_dependencies d
   WHERE d.id=p_dependency_id AND d.order_id=v_order FOR UPDATE;
 IF v_link.id IS NULL THEN RAISE EXCEPTION 'Dependência alterada; recarregue a OS' USING ERRCODE='40001'; END IF;
 DELETE FROM public.os_item_operation_dependencies WHERE id=p_dependency_id;
 INSERT INTO public.dashboard_operation_dependency_audit
   (dependency_id,order_id,predecessor_operation_id,successor_operation_id,
    action,changed_by,reason)
 VALUES(v_link.id,v_link.order_id,v_link.predecessor_operation_id,
   v_link.successor_operation_id,'REMOVED',v_actor,btrim(p_reason));
 RETURN v_link.id;
END $$;

-- Limpeza de vínculos de atividades movidas/canceladas/excluídas (inclusive
-- operações de itens, e exclusão de OS). Preserva auditoria independente.
-- A limpeza ocorre na MESMA transação da alteração operacional existente.
CREATE OR REPLACE FUNCTION public.dashboard_cleanup_dependencies_on_source() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE v_order uuid;
BEGIN
 -- Cada ramo usa somente campos existentes no tipo de linha OLD daquela tabela.
 -- Isso evita resolução de campos inexistentes em triggers de tabelas distintas.
 IF TG_TABLE_NAME='os_orders' THEN
   IF TG_OP='DELETE' THEN
     v_order:=OLD.id;
     WITH removed AS (
       DELETE FROM public.os_item_operation_dependencies d
        WHERE d.order_id=OLD.id
       RETURNING d.*
     )
     INSERT INTO public.dashboard_operation_dependency_audit
       (dependency_id,order_id,predecessor_operation_id,successor_operation_id,
        action,changed_by,reason)
     SELECT id,order_id,predecessor_operation_id,successor_operation_id,
       'REMOVED',auth.uid(),'Vínculo invalidado pela exclusão da OS'
     FROM removed;
   END IF;

 ELSIF TG_TABLE_NAME='os_order_items' THEN
   v_order:=OLD.order_id;
   IF TG_OP='DELETE' OR
      (TG_OP='UPDATE' AND
       ((OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR
        (OLD.status<>'CANCELLED' AND NEW.status='CANCELLED') OR
        OLD.order_id IS DISTINCT FROM NEW.order_id)) THEN
     PERFORM 1 FROM public.os_orders o WHERE o.id=v_order FOR UPDATE;
     WITH removed AS (
       DELETE FROM public.os_item_operation_dependencies d
        WHERE EXISTS (
          SELECT 1 FROM public.os_order_item_operations op
           WHERE op.item_id=OLD.id
             AND (op.id=d.predecessor_operation_id OR op.id=d.successor_operation_id)
        )
       RETURNING d.*
     )
     INSERT INTO public.dashboard_operation_dependency_audit
       (dependency_id,order_id,predecessor_operation_id,successor_operation_id,
        action,changed_by,reason)
     SELECT id,order_id,predecessor_operation_id,successor_operation_id,
       'REMOVED',auth.uid(),'Vínculo invalidado por cancelamento, movimentação ou exclusão do item'
     FROM removed;
   END IF;

 ELSIF TG_TABLE_NAME='os_order_item_operations' THEN
   SELECT item.order_id INTO v_order
     FROM public.os_order_items item WHERE item.id=OLD.item_id;
   IF TG_OP='DELETE' OR
      (TG_OP='UPDATE' AND
       ((OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR
        OLD.item_id IS DISTINCT FROM NEW.item_id)) THEN
     PERFORM 1 FROM public.os_orders o WHERE o.id=v_order FOR UPDATE;
     WITH removed AS (
       DELETE FROM public.os_item_operation_dependencies d
        WHERE d.predecessor_operation_id=OLD.id
           OR d.successor_operation_id=OLD.id
       RETURNING d.*
     )
     INSERT INTO public.dashboard_operation_dependency_audit
       (dependency_id,order_id,predecessor_operation_id,successor_operation_id,
        action,changed_by,reason)
     SELECT id,order_id,predecessor_operation_id,successor_operation_id,
       'REMOVED',auth.uid(),'Vínculo invalidado por alteração ou exclusão da operação'
     FROM removed;
   END IF;
 END IF;

 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $;

CREATE TRIGGER dashboard_dependency_cleanup_operation
 BEFORE UPDATE OF deleted_at,item_id OR DELETE ON public.os_order_item_operations
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_cleanup_dependencies_on_source();
CREATE TRIGGER dashboard_dependency_cleanup_item
 BEFORE UPDATE OF deleted_at,order_id,status OR DELETE ON public.os_order_items
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_cleanup_dependencies_on_source();
CREATE TRIGGER dashboard_dependency_cleanup_order
 BEFORE DELETE ON public.os_orders
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_cleanup_dependencies_on_source();

REVOKE ALL ON FUNCTION public.dashboard_link_operations(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_unlink_operations(uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_cleanup_dependencies_on_source()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_link_operations(uuid,uuid,uuid,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_unlink_operations(uuid,text)
 TO authenticated;
