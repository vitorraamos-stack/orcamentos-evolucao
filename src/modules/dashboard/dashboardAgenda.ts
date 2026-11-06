import type { DashboardOrder } from "./dashboardModel";
import { addLocalDays, formatLocalDate } from "@/shared/lib/date";
import { saoPauloDateKey } from "@/shared/lib/saoPauloTime";

/** Only columns from the existing, RLS-protected logistics tables. No mutations. */
export type DashboardInstallation = {
  id: string; os_id: string; team_id: string | null; responsible_id: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  scheduled_start: string; scheduled_end: string | null;
  estimated_duration_minutes: number | null; address_snapshot: string | null;
};
export type DashboardDelivery = {
  id: string; os_id: string; mode: "OWN_DELIVERY" | "CARRIER";
  status: "SCHEDULED" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  scheduled_at: string | null; assigned_to: string | null;
};

export type AgendaKind = "installation" | "delivery" | "deadline";
export type AgendaPeriod = "today" | "week";
export type AgendaFilter = "all" | AgendaKind | "late" | "conflicts";
export type AgendaEvent = {
  key: string;
  kind: AgendaKind;
  order: DashboardOrder;
  dateKey: string;
  when: string;
  hasTime: boolean;
  label: string;
  status: string;
  warnings: string[];
  overdueWithoutCompletion: boolean;
  conflict: boolean;
};
export type DashboardAgenda = {
  events: AgendaEvent[];
  waitingInstallations: number | null;
  waitingDeliveries: number | null;
  overdueWithoutCompletion: number;
  conflicts: number;
  missingInformation: number;
};
export type DashboardAgendaSources = {
  installations: readonly DashboardInstallation[];
  deliveries: readonly DashboardDelivery[];
  canViewInstallations: boolean;
  canViewDeliveries: boolean;
};

const validInstant = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function installationInterval(row: DashboardInstallation) {
  const start = validInstant(row.scheduled_start);
  if (start === null) return null;
  const explicitEnd = validInstant(row.scheduled_end);
  const end = explicitEnd ?? (
    row.estimated_duration_minutes && row.estimated_duration_minutes > 0
      ? start + row.estimated_duration_minutes * 60_000 : null
  );
  return end !== null && end > start ? { start, end } : null;
}

/** Flag only genuine overlaps, with documented duration or end times. */
export function findInstallationConflicts(rows: readonly DashboardInstallation[]): Set<string> {
  const active = rows.filter(row => row.status === "SCHEDULED" || row.status === "IN_PROGRESS");
  const groups = new Map<string, Array<{ id: string; start: number; end: number }>>();
  for (const row of active) {
    const interval = installationInterval(row);
    if (!interval) continue;
    for (const key of [
      row.team_id ? "team:" + row.team_id : null,
      row.responsible_id ? "person:" + row.responsible_id : null,
    ]) {
      if (!key) continue;
      const list = groups.get(key) ?? [];
      list.push({ id: row.id, ...interval });
      groups.set(key, list);
    }
  }
  const conflicts = new Set<string>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length && group[j].start < group[i].end; j++) {
        if (group[i].id !== group[j].id && group[j].end > group[i].start) {
          conflicts.add(group[i].id);
          conflicts.add(group[j].id);
        }
      }
    }
  }
  return conflicts;
}

export function buildDashboardAgenda(
  orders: readonly DashboardOrder[],
  sources: DashboardAgendaSources,
  now = new Date()
): DashboardAgenda {
  const orderMap = new Map(orders.filter(o => !o.archived && o.prod_status !== "Finalizados").map(o => [o.id, o]));
  const activeInstallations = sources.canViewInstallations
    ? sources.installations.filter(i => i.status === "SCHEDULED" || i.status === "IN_PROGRESS")
    : [];
  const activeDeliveries = sources.canViewDeliveries
    ? sources.deliveries.filter(d => d.status === "SCHEDULED" || d.status === "IN_TRANSIT")
    : [];
  const activeInstallationIds = new Set(activeInstallations.map(i => i.os_id));
  const activeDeliveryIds = new Set(activeDeliveries.map(d => d.os_id));
  const conflicts = findInstallationConflicts(activeInstallations);
  const events: AgendaEvent[] = [];
  for (const row of activeInstallations) {
    const order = orderMap.get(row.os_id);
    if (!order || validInstant(row.scheduled_start) === null) continue;
    const warnings: string[] = [];
    const late = Date.parse(row.scheduled_start) < now.getTime();
    if (late) warnings.push("Horário previsto passou; conclusão não registrada");
    if (conflicts.has(row.id)) warnings.push("Conflito de horário registrado");
    if (!row.team_id && !row.responsible_id) warnings.push("Equipe ou responsável não informado");
    if (!row.address_snapshot?.trim()) warnings.push("Endereço não informado");
    events.push({
      key: "installation:" + row.id, kind: "installation", order,
      dateKey: saoPauloDateKey(row.scheduled_start), when: row.scheduled_start, hasTime: true,
      label: "Instalação", status: row.status === "IN_PROGRESS" ? "Em execução" : "Agendada",
      warnings, overdueWithoutCompletion: late, conflict: conflicts.has(row.id),
    });
  }
  for (const row of activeDeliveries) {
    const order = orderMap.get(row.os_id);
    if (!order) continue;
    // A delivery without scheduled_at has no calendar event; never assign a fictitious date.
    if (!row.scheduled_at || validInstant(row.scheduled_at) === null) continue;
    const late = Date.parse(row.scheduled_at) < now.getTime();
    const warnings: string[] = [];
    if (late) warnings.push("Horário previsto passou; conclusão não registrada");
    if (row.mode === "OWN_DELIVERY" && !row.assigned_to) warnings.push("Responsável não informado");
    events.push({
      key: "delivery:" + row.id, kind: "delivery", order,
      dateKey: saoPauloDateKey(row.scheduled_at), when: row.scheduled_at, hasTime: true,
      label: row.mode === "CARRIER" ? "Transportadora" : "Entrega",
      status: row.status === "IN_TRANSIT" ? "Em trânsito" : "Agendada",
      warnings, overdueWithoutCompletion: late, conflict: false,
    });
  }
  for (const order of orderMap.values()) {
    if (!order.delivery_date || !/^\d{4}-\d{2}-\d{2}$/.test(order.delivery_date)) continue;
    events.push({
      key: "deadline:" + order.id, kind: "deadline", order,
      dateKey: order.delivery_date, when: order.delivery_date, hasTime: false,
      label: "Prazo da OS", status: "Prazo registrado",
      warnings: [], overdueWithoutCompletion: false, conflict: false,
    });
  }
  events.sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey) ||
    (a.hasTime && b.hasTime ? a.when.localeCompare(b.when) : a.hasTime ? -1 : b.hasTime ? 1 : 0) ||
    a.key.localeCompare(b.key)
  );
  return {
    events,
    waitingInstallations: sources.canViewInstallations
      ? [...orderMap.values()].filter(o => o.logistic_type === "instalacao" &&
        (o.prod_status === "Pronto / Avisar Cliente" || o.prod_status === "Instalação Agendada") &&
        !activeInstallationIds.has(o.id)).length
      : null,
    waitingDeliveries: sources.canViewDeliveries
      ? [...orderMap.values()].filter(o => o.logistic_type === "entrega" &&
        (o.prod_status === "Pronto / Avisar Cliente" || o.prod_status === "Logística (Entrega/Transportadora)") &&
        !activeDeliveryIds.has(o.id)).length
      : null,
    overdueWithoutCompletion: events.filter(e => e.overdueWithoutCompletion).length,
    conflicts: events.filter(e => e.conflict).length,
    missingInformation: events.filter(e => e.warnings.some(w => /não informado/.test(w))).length,
  };
}

/** Date filters affect the agenda exclusively, never indicators or priority ranking. */
export function filterDashboardAgenda(
  agenda: DashboardAgenda, period: AgendaPeriod, kind: AgendaFilter, now: Date
): AgendaEvent[] {
  const today = formatLocalDate(now);
  const end = formatLocalDate(addLocalDays(now, 6));
  return agenda.events.filter(item => {
    if (kind === "late") return item.overdueWithoutCompletion;
    if (kind === "conflicts") return item.conflict;
    if (kind !== "all" && item.kind !== kind) return false;
    return item.dateKey >= today && item.dateKey <= (period === "today" ? today : end);
  });
}

export function agendaEventTime(event: AgendaEvent) {
  if (!event.hasTime) {
    const [year, month, day] = event.dateKey.split("-");
    return day + "/" + month + "/" + year + " · Sem horário";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  }).format(new Date(event.when));
}
