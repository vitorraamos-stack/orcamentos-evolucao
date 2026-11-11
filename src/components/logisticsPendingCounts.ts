/** Contagem enxuta das filas existentes, sem incluir histórico concluído/cancelado. */
export type PendingOrder = {
  id: string;
  logistic_type: string | null;
  prod_status: string | null;
  archived: boolean;
};
export type PendingInstallation = { os_id: string };
export type PendingDelivery = { os_id: string };
export type PendingPickupFlow = {
  source_type: string;
  source_id: string;
  retirado_at: string | null;
};

/** Badge de Instalações: somente a fila "Aguardando agendamento".
 * Instalações agendadas ou em execução pertencem à Agenda, não são pendências
 * de agendamento. Os status seguem as mesmas regras da Central.
 */
export function countWaitingInstallations(input: {
  orders: readonly PendingOrder[];
  active: readonly PendingInstallation[];
}): number {
  const scheduledOrderIds = new Set(input.active.map(row => row.os_id));
  return input.orders.filter(order =>
    !order.archived &&
    order.logistic_type === "instalacao" &&
    ["Pronto / Avisar Cliente", "Instalação Agendada"].includes(order.prod_status ?? "") &&
    !scheduledOrderIds.has(order.id)
  ).length;
}

export function countOpenDeliveries(input: {
  orders: readonly PendingOrder[];
  active: readonly PendingDelivery[];
  flows: readonly PendingPickupFlow[];
}): number {
  const activeIds = new Set(input.active.map(row => row.os_id));
  const collected = new Set(
    input.flows.filter(row => row.source_type === "os_orders" && row.retirado_at)
      .map(row => row.source_id)
  );
  const waiting = input.orders.filter(order =>
    !order.archived &&
    order.logistic_type === "entrega" &&
    ["Pronto / Avisar Cliente", "Logística (Entrega/Transportadora)"].includes(order.prod_status ?? "") &&
    !activeIds.has(order.id)
  ).length;
  const pickup = input.orders.filter(order =>
    !order.archived &&
    order.logistic_type === "retirada" &&
    ["Pronto / Avisar Cliente", "Finalizados"].includes(order.prod_status ?? "") &&
    !collected.has(order.id)
  ).length;
  return waiting + input.active.length + pickup;
}
