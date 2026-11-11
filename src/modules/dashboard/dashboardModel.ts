import type { OsOrder } from "@/features/hubos/types";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { businessDaysUntilDeadline, isOrderFinished, isOrderStale } from "@/modules/orders/risk";
import { formatLocalDate } from "@/shared/lib/date";

/** Projection of RLS-visible os_orders. The Dashboard never changes an OS. */
export type DashboardOrder = Pick<
  OsOrder,
  | "id" | "sale_number" | "client_name" | "title" | "delivery_date"
  | "updated_at" | "prod_status" | "art_status" | "production_tag"
  | "logistic_type" | "archived" | "is_urgent" | "art_direction_tag"
>;

export type DashboardPriority = {
  order: DashboardOrder;
  reason: string;
  stage: string;
  rank: number;
};

export type DashboardOverview = {
  active: number;
  attention: number;
  overdue: number;
  dueToday: number;
  priorities: DashboardPriority[];
  sectors: { artwork: number; production: number; finishing: number; logistics: number };
};

export function dashboardOrderStage(order: DashboardOrder): string {
  if (order.prod_status === "Instalação Agendada") return "Instalação agendada";
  if (order.prod_status === "Logística (Entrega/Transportadora)") return "Logística";
  if (order.prod_status === "Pronto / Avisar Cliente") return "Material pronto";
  if (order.prod_status === "Em Acabamento") return "Finalização";
  if (order.prod_status === "Produção") return "Produção";
  if (order.art_status === "Para Aprovação") return "Aguardando aprovação";
  if (order.art_status === "Ajustes") return "Ajustes de arte";
  if (order.art_status === "Em Criação") return "Arte";
  return order.art_status || "Etapa não informada";
}

/** Only actual alerts enter the top-five priorities or the attention indicator. */
const FIRST_NON_ALERT_RANK = 7;

/** Priority labels follow operational weekdays; idleness is a separate signal. */
export function dashboardPriorityReason(order: DashboardOrder, now: Date) {
  const today = formatLocalDate(now);
  const businessDays = businessDaysUntilDeadline(order.delivery_date, now);
  if (order.delivery_date && order.delivery_date < today)
    return { rank: 0, reason: "Prazo vencido" };
  if (order.production_tag === "AGUARDANDO_INSUMOS")
    return { rank: 1, reason: "Aguardando insumos" };
  if (order.art_status === "Ajustes")
    return { rank: 1, reason: "Ajustes de arte pendentes" };
  if (order.delivery_date === today)
    return { rank: 2, reason: "Vence hoje" };
  if (businessDays !== null && businessDays <= 1)
    return { rank: 3, reason: "Prazo crítico" };
  if (isOrderUrgent(order))
    return { rank: 4, reason: "Marcada como urgente" };
  if (businessDays !== null && businessDays <= 3)
    return { rank: 5, reason: "Próximo prazo" };
  if (isOrderStale(order, now))
    return { rank: 6, reason: "Sem atualização há 4+ dias" };
  return { rank: FIRST_NON_ALERT_RANK, reason: order.delivery_date ? "Dentro do prazo" : "Sem prazo informado" };
}

/**
 * A single order counts once per indicator, but legitimately appears in
 * several indicators/sectors. A missing due date is never an overdue OS.
 * The same frozen SC reference time is used for all calculated values.
 */
export function buildDashboardOverview(rows: readonly DashboardOrder[], now: Date): DashboardOverview {
  const today = formatLocalDate(now);
  const unique = new Map<string, DashboardOrder>();
  for (const order of rows) {
    if (!isOrderFinished(order)) unique.set(order.id, order);
  }
  const active = Array.from(unique.values());
  const ranked: DashboardPriority[] = active.map(order => ({
    order,
    ...dashboardPriorityReason(order, now),
    stage: dashboardOrderStage(order),
  }));
  ranked.sort((a, b) =>
    a.rank - b.rank ||
    (a.order.delivery_date ?? "9999-12-31").localeCompare(b.order.delivery_date ?? "9999-12-31") ||
    (a.order.updated_at ?? "").localeCompare(b.order.updated_at ?? "") ||
    a.order.id.localeCompare(b.order.id)
  );

  return {
    active: active.length,
    attention: ranked.filter(row => row.rank < FIRST_NON_ALERT_RANK).length,
    overdue: active.filter(order => !!order.delivery_date && order.delivery_date < today).length,
    dueToday: active.filter(order => order.delivery_date === today).length,
    priorities: ranked.filter(row => row.rank < FIRST_NON_ALERT_RANK).slice(0, 5),
    sectors: {
      artwork: active.filter(order => order.art_status !== "Produzir").length,
      production: active.filter(order =>
        order.prod_status === "Produção" ||
        order.production_tag === "EM_PRODUCAO" ||
        order.production_tag === "PRODUCAO_EXTERNA"
      ).length,
      finishing: active.filter(order =>
        order.prod_status === "Em Acabamento" ||
        order.prod_status === "Pronto / Avisar Cliente"
      ).length,
      logistics: active.filter(order =>
        order.prod_status === "Logística (Entrega/Transportadora)" ||
        order.prod_status === "Instalação Agendada"
      ).length,
    },
  };
}
