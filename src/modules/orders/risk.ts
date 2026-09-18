export type OrderRisk = "NORMAL" | "ATENCAO" | "CRITICO";

export type RiskOrder = {
  delivery_date?: string | null;
  updated_at?: string | null;
  prod_status?: string | null;
  logistic_type?: string | null;
  archived?: boolean;
};

const dayStart = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());
const normalize = (value?: string | null) =>
  (value ?? "").toLocaleLowerCase("pt-BR");

export const isOrderFinished = (order: RiskOrder) =>
  Boolean(order.archived) || normalize(order.prod_status).includes("finaliz");

export function calculateOrderRisk(
  order: RiskOrder,
  now = new Date()
): OrderRisk {
  if (isOrderFinished(order)) return "NORMAL";

  const today = dayStart(now);
  const deadline = order.delivery_date
    ? dayStart(new Date(`${order.delivery_date}T12:00:00`))
    : null;
  const daysToDeadline = deadline
    ? Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000)
    : null;
  const productionReady = /pronto|logística|logistica|instalação agendada/.test(
    normalize(order.prod_status)
  );

  if (daysToDeadline !== null && daysToDeadline < 0) return "CRITICO";
  if (daysToDeadline === 0 && !productionReady) return "CRITICO";
  if (
    order.logistic_type === "instalacao" &&
    daysToDeadline !== null &&
    daysToDeadline <= 1 &&
    !productionReady
  ) {
    return "CRITICO";
  }

  const updatedAt = order.updated_at ? new Date(order.updated_at) : null;
  const idleDays = updatedAt
    ? Math.floor((now.getTime() - updatedAt.getTime()) / 86_400_000)
    : 0;
  if ((daysToDeadline !== null && daysToDeadline <= 2) || idleDays >= 4)
    return "ATENCAO";

  return "NORMAL";
}
