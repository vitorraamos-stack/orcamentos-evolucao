import type { FinanceInstallmentStatus } from "@/features/hubos/types";

export const FINANCE_STATUS_LABEL: Record<string, string> = {
  AWAITING_PROOF: "Aguardando comprovante",
  PENDING_REVIEW: "Pendente (revisão)",
  CONCILIADO: "Conciliado",
  LANCADO: "Lançado",
  REJEITADO: "Rejeitado",
  CADASTRO_PENDENTE: "Cadastro pendente",
  AWAITING_SECOND_INSTALLMENT: "Aguardando 2ª parcela",
  POSTED: "Lançado",
  RECONCILED: "Conciliado",
  REGISTRATION_PENDING: "Cadastro pendente",
};

export function labelFinanceStatus(
  status?: FinanceInstallmentStatus | string | null
) {
  if (!status) return "—";
  return FINANCE_STATUS_LABEL[status] ?? status;
}
