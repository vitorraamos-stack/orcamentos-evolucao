-- Corrects the operation pause trigger timing:
-- an INSERT pause must run after the operation row exists (FK to operation_id),
-- while a DELETE must close the pause before the operation row is removed.
DROP TRIGGER IF EXISTS dashboard_stage_pause_operation_status
  ON public.os_order_item_operations;

CREATE TRIGGER dashboard_stage_pause_operation_status
AFTER INSERT OR UPDATE OF status,item_id,deleted_at
ON public.os_order_item_operations
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_capture_operation_pause();

DROP TRIGGER IF EXISTS dashboard_stage_pause_operation_delete
  ON public.os_order_item_operations;

CREATE TRIGGER dashboard_stage_pause_operation_delete
BEFORE DELETE
ON public.os_order_item_operations
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_capture_operation_pause();

COMMENT ON TRIGGER dashboard_stage_pause_operation_status
  ON public.os_order_item_operations IS
  'Registra pausa após a operação existir; atualizações de status são capturadas depois da gravação.';
COMMENT ON TRIGGER dashboard_stage_pause_operation_delete
  ON public.os_order_item_operations IS
  'Encerra a pausa antes da exclusão física da operação e da ação FK SET NULL.';
