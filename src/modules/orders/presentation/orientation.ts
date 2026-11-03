import type { VerifiedOrientation } from "../components/OrderOrientationStrip";
type Operation = {
  id: string;
  status: string;
  assigned_to?: string | null;
  is_required?: boolean;
  blocked_reason?: string | null;
};
export function getVerifiedOrientation(input: {
  loaded: boolean;
  error: string | null;
  operations: readonly Operation[];
  userId?: string | null;
  productionStatus?: string | null;
}): VerifiedOrientation {
  if (!input.loaded || input.error) return { kind: "neutral" };
  const blocked = input.operations.find(op => op.is_required && op.status === "BLOCKED");
  if (blocked) {
    return {
      kind: "blocked", recordId: blocked.id,
      reason: blocked.blocked_reason?.trim() || "Existe uma operação obrigatória bloqueada. Consulte Produção."
    };
  }
  const eligible = input.operations.filter(op => op.is_required &&
    (op.status === "PENDING" || op.status === "IN_PROGRESS"));
  const own = input.userId ? eligible.find(op => op.assigned_to === input.userId) : undefined;
  const selected = own || eligible[0];
  if (selected) return {
    kind: "next", recordId: selected.id, own: Boolean(own),
    title: selected.status === "PENDING" ? "Operação de produção a iniciar" : "Operação em andamento",
    description: own ? "Operação obrigatória atribuída a você." : "Operação obrigatória registrada na OS."
  };
  const status = (input.productionStatus || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return statu���q�^