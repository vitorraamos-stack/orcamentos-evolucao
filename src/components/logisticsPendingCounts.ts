/** Contagem enxuta das filas existentes, sem incluir histórico concluído/cancelado. */
export type PendingOrder = {
  id: string;
  logistic_type: string | null;
  prod_status: string | null;
  archived: boolean;
};
export type PendingInstallation = {
  os_id: string;
  team_id: string | null;
  responsible_id: string | null;
};
export type PendingDelivery = { os_id: string };
export type PendingPickupFlow = {
  source_type: string;
  source_id: string;
  retirado_at: string | null;
};

export function countOpenInstallations(input: {
  orders: readonly PendingOrder[];
  active: readonly PendingInstallation[];
  teamIds: ReadonlySet<string>;
  userId: string;
  isManager: boolean;
  agendaOnly: boolean;
}): number {
  const activeIds = new Set(input.active.map(row => row.os_id));
  // A consultora com acesso somente à agenda pode consultar todas as equipes,
  // mas não a aba "Aguardando agendamento".
  const visibleActive = input.active.filter(row =>
    input.agendaOnly || input.isManager ||
    row.responsible_id === input.userId ||
    Boolean(row.team_id && input.teamIds.has(row.team_id))
  ).length;
  if (input.agendaOnly) return visibleActive;

  const waiting = input.orders.filter(order =>
    !order.archived &&
    order.logistic_type === "instalacao" &&
    ["Pronto / Avisar Cliente", "Instalação Agendada"].includes(order.prod_status ?? "") &&
    !activeIds.has(order.id)
  ).length;
  return visibleActive + waiting;
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
