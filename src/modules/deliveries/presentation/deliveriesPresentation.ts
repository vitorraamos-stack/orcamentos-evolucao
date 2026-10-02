import type { LogisticsOrder } from "@/modules/installations/types";
import type { Delivery, DeliveryMode } from "../types";

export const DELIVERY_TIME_ZONE = "America/Sao_Paulo";

export type DispatchQuickFilter =
  | "all"
  | "scheduled"
  | "in_transit"
  | "overdue";
export type HistoryPeriod = "today" | "week" | "month" | "all";
export type HistoryType = "all" | "pickup" | DeliveryMode;
export type FlowRow = {
  source_id?: string;
  avisado_at?: string | null;
  retirado_at?: string | null;
};
export type CompletedLogisticsEntry =
  | { kind: "delivery"; id: string; occurredAt: string; delivery: Delivery }
  | {
      kind: "pickup";
      id: string;
      occurredAt: string;
      order: LogisticsOrder;
      flow: FlowRow;
    };

const dateKey = (value: string | Date, timeZone = DELIVERY_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const text = (value: unknown) => String(value ?? "").toLocaleLowerCase("pt-BR");
const orderText = (order?: LogisticsOrder | null) =>
  text([order?.sale_number, order?.client_name, order?.address].join(" "));
const deadlineTime = (order?: LogisticsOrder | null) =>
  order?.delivery_date
    ? new Date(`${order.delivery_date}T12:00:00-03:00`).getTime()
    : Number.POSITIVE_INFINITY;

export const isDeliveryOverdue = (delivery: Delivery, now = new Date()) =>
  delivery.status === "SCHEDULED" &&
  Boolean(delivery.scheduled_at) &&
  new Date(delivery.scheduled_at!).getTime() < now.getTime();

export const isDeliveryCompletedToday = (
  delivery: Delivery,
  now = new Date()
) =>
  delivery.status === "COMPLETED" &&
  Boolean(delivery.completed_at) &&
  dateKey(delivery.completed_at!) === dateKey(now);

export const isPickupCompletedToday = (flow?: FlowRow, now = new Date()) =>
  Boolean(flow?.retirado_at) && dateKey(flow!.retirado_at!) === dateKey(now);

export function summarizeDeliveryWorkspace(
  input: {
    waiting: LogisticsOrder[];
    legacy: LogisticsOrder[];
    activePickups: LogisticsOrder[];
    deliveries: Delivery[];
    completedPickups: LogisticsOrder[];
    flowFor: (order: LogisticsOrder) => FlowRow | undefined;
  },
  now = new Date()
) {
  return {
    waiting: input.waiting.length + input.legacy.length,
    pickup: input.activePickups.length,
    inTransit: input.deliveries.filter(item => item.status === "IN_TRANSIT")
      .length,
    overdue: input.deliveries.filter(item => isDeliveryOverdue(item, now))
      .length,
    completedToday:
      input.deliveries.filter(item => isDeliveryCompletedToday(item, now))
        .length +
      input.completedPickups.filter(item =>
        isPickupCompletedToday(input.flowFor(item), now)
      ).length,
  };
}

export const filterWaitingOrders = (
  orders: LogisticsOrder[],
  query: string
) => {
  const q = text(query.trim());
  return q ? orders.filter(order => orderText(order).includes(q)) : orders;
};
export const sortWaitingOrders = (orders: LogisticsOrder[]) =>
  [...orders].sort(
    (a, b) =>
      deadlineTime(a) - deadlineTime(b) ||
      a.client_name.localeCompare(b.client_name, "pt-BR")
  );

export const filterPickups = (orders: LogisticsOrder[], query: string) => {
  const q = text(query.trim());
  return q
    ? orders.filter(order =>
        text([order.sale_number, order.client_name].join(" ")).includes(q)
      )
    : orders;
};
export const sortPickups = (
  orders: LogisticsOrder[],
  flowFor: (order: LogisticsOrder) => FlowRow | undefined
) =>
  [...orders].sort((a, b) => {
    const af = flowFor(a),
      bf = flowFor(b);
    if (Boolean(af?.avisado_at) !== Boolean(bf?.avisado_at))
      return af?.avisado_at ? 1 : -1;
    const deadline = deadlineTime(a) - deadlineTime(b);
    if (deadline) return deadline;
    return (
      new Date(af?.avisado_at ?? 0).getTime() -
      new Date(bf?.avisado_at ?? 0).getTime()
    );
  });

export const filterActiveDeliveries = (
  deliveries: Delivery[],
  query: string,
  quickFilter: DispatchQuickFilter,
  now = new Date()
) => {
  const q = text(query.trim());
  return deliveries.filter(delivery => {
    const quick =
      quickFilter === "all" ||
      (quickFilter === "scheduled" && delivery.status === "SCHEDULED") ||
      (quickFilter === "in_transit" && delivery.status === "IN_TRANSIT") ||
      (quickFilter === "overdue" && isDeliveryOverdue(delivery, now));
    const searchable = text(
      [
        orderText(delivery.order),
        delivery.carrier_name,
        delivery.tracking_code,
        delivery.vehicle_label,
      ].join(" ")
    );
    return quick && (!q || searchable.includes(q));
  });
};
export const sortActiveDeliveries = (
  deliveries: Delivery[],
  now = new Date()
) =>
  [...deliveries].sort((a, b) => {
    const rank = (item: Delivery) =>
      item.status === "IN_TRANSIT"
        ? 0
        : isDeliveryOverdue(item, now)
          ? 1
          : item.scheduled_at
            ? 2
            : 3;
    return (
      rank(a) - rank(b) ||
      (a.scheduled_at && b.scheduled_at
        ? new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime()
        : 0) ||
      orderText(a.order).localeCompare(orderText(b.order), "pt-BR")
    );
  });

export const buildCompletedLogistics = (
  deliveries: Delivery[],
  pickups: LogisticsOrder[],
  flowFor: (order: LogisticsOrder) => FlowRow | undefined
): CompletedLogisticsEntry[] =>
  [
    ...deliveries
      .filter(item => item.completed_at)
      .map(item => ({
        kind: "delivery" as const,
        id: item.id,
        occurredAt: item.completed_at!,
        delivery: item,
      })),
    ...pickups.flatMap(order => {
      const flow = flowFor(order);
      return flow?.retirado_at
        ? [
            {
              kind: "pickup" as const,
              id: order.id,
              occurredAt: flow.retirado_at,
              order,
              flow,
            },
          ]
        : [];
    }),
  ].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

export function filterCompletedLogistics(
  entries: CompletedLogisticsEntry[],
  query: string,
  type: HistoryType,
  period: HistoryPeriod,
  now = new Date()
) {
  const q = text(query.trim()),
    today = dateKey(now);
  const nowDate = new Date(`${today}T12:00:00-03:00`);
  const monday = new Date(nowDate);
  monday.setDate(nowDate.getDate() - ((nowDate.getDay() + 6) % 7));
  return entries.filter(entry => {
    const order =
      entry.kind === "delivery" ? entry.delivery.order : entry.order;
    const typeMatch =
      type === "all" ||
      (type === "pickup"
        ? entry.kind === "pickup"
        : entry.kind === "delivery" && entry.delivery.mode === type);
    const key = dateKey(entry.occurredAt);
    const periodMatch =
      period === "all" ||
      (period === "today" && key === today) ||
      (period === "month" && key.slice(0, 7) === today.slice(0, 7)) ||
      (period === "week" &&
        new Date(`${key}T12:00:00-03:00`) >= monday &&
        new Date(`${key}T12:00:00-03:00`) <= nowDate);
    return typeMatch && periodMatch && (!q || orderText(order).includes(q));
  });
}

export const reconcileDeliverySelection = (
  currentId: string | null,
  visibleIds: string[]
) =>
  currentId && visibleIds.includes(currentId)
    ? currentId
    : (visibleIds[0] ?? null);

export const formatDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: DELIVERY_TIME_ZONE,
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Não informado";
export const formatDeliveryDeadline = (
  value?: string | null,
  now = new Date()
) => {
  if (!value) return "Sem prazo";
  const target = new Date(`${value}T12:00:00-03:00`),
    current = new Date(`${dateKey(now)}T12:00:00-03:00`);
  const days = Math.round((target.getTime() - current.getTime()) / 86400000);
  if (days < 0) return "Prazo vencido";
  if (days === 0) return "Prazo hoje";
  if (days === 1) return "Prazo amanhã";
  return `Prazo em ${days} dias`;
};
export const formatDeliveryScheduleStatus = (
  delivery: Delivery,
  now = new Date()
) => {
  if (!delivery.scheduled_at) return "Sem horário";
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: DELIVERY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(delivery.scheduled_at));
  if (isDeliveryOverdue(delivery, now)) return `Atrasada · ${time}`;
  const target = dateKey(delivery.scheduled_at),
    today = dateKey(now);
  if (target === today) return `Hoje · ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target === dateKey(tomorrow)) return `Amanhã · ${time}`;
  return formatDateTime(delivery.scheduled_at);
};
