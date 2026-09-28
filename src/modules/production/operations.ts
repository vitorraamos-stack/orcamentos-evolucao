export const WORK_CENTERS = ["PRINTING", "METALWORK", "ASSEMBLY", "CHANNEL_LETTER", "ELECTRICAL_LIGHTING", "EXTERNAL_PRODUCTION", "FINISHING_QC"] as const;
export type WorkCenter = (typeof WORK_CENTERS)[number];
export const WORK_CENTER_LABELS: Record<WorkCenter, string> = {
  PRINTING: "Impressão", METALWORK: "Serralheria", ASSEMBLY: "Montagem",
  CHANNEL_LETTER: "Letra Caixa", ELECTRICAL_LIGHTING: "Elétrica / Iluminação",
  EXTERNAL_PRODUCTION: "Produção Externa", FINISHING_QC: "Acabamento / Conferência",
};
export const OPERATION_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];
export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  PENDING: "Pendente", IN_PROGRESS: "Em andamento", COMPLETED: "Concluído", BLOCKED: "Bloqueado",
};
export type ItemOperation = { id:string; item_id:string; work_center:WorkCenter; status:OperationStatus; assigned_to:string|null; is_required:boolean; notes:string|null; blocked_reason:string|null; sort_order:number; started_at:string|null; completed_at:string|null; created_at:string; updated_at:string; assignee?:{ id:string; name:string; email:string|null } };
export function operationSummary(operations: Pick<ItemOperation,"status"|"is_required"|"work_center">[]) {
  const required = operations.filter(value => value.is_required);
  return { total: required.length, completed: required.filter(value => value.status === "COMPLETED").length, blocked: operations.filter(value => value.status === "BLOCKED").length, activeWorkCenters: Array.from(new Set(operations.filter(value => value.status === "IN_PROGRESS" || value.status === "BLOCKED").map(value => value.work_center))) };
}
