import { saoPauloDateKey } from "@/shared/lib/saoPauloTime";
import { installationEventDate } from "../services/installations";
import type { Installation, LogisticsOrder } from "../types";

export type AgendaQuickFilter = "all" | "today" | "in_progress" | "overdue";
export type HistoryPeriod = "week" | "month" | "all";
export type HistoryStatus = "all" | "completed" | "cancelled";

const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, amount: number) => {
  const date = keyDate(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const shiftWeekStart = (weekStart: string, weeks: number) =>
  addDays(weekStart, weeks * 7);

export function getSaoPauloWeekRange(now = new Date()) {
  const today = saoPauloDateKey(now.toISOString());
  const day = keyDate(today).getUTCDay();
  const start = addDays(today, -(day === 0 ? 6 : day - 1));
  return { start, end: addDays(start, 6) };
}

export const getSaoPauloWeekDays = (start: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(start, index));

export const filterInstallationsByWeek = (
  rows: Installation[],
  weekStart: string
) => {
  const weekEnd = addDays(weekStart, 6);
  return rows.filter(row => {
    const key = saoPauloDateKey(row.scheduled_start);
    return key >= weekStart && key <= weekEnd;
  });
};

export function getTeamSchedulePresentation({
  teamId,
  installations,
  now = new Date(),
}: {
  teamId: string;
  installations: Installation[];
  now?: Date;
}) {
  const teamInstallations = installations.filter(row => row.team_id === teamId);
  return {
    todayCount: teamInstallations.filter(row => isInstallationToday(row, now))
      .length,
    nextInstallation: teamInstallations
      .filter(row => new Date(row.scheduled_start) >= now)
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0],
  };
}

export const isInstallationToday = (row: Installation, now = new Date()) =>
  ["SCHEDULED", "IN_PROGRESS"].includes(row.status) &&
  saoPauloDateKey(row.scheduled_start) === saoPauloDateKey(now.toISOString());

export const isScheduledInstallationOverdue = (
  row: Installation,
  now = new Date()
) => row.status === "SCHEDULED" && new Date(row.scheduled_start) < now;

export const isInstallationCompletedThisWeek = (
  row: Installation,
  now = new Date()
) => {
  if (row.status !== "COMPLETED" || !row.completed_at) return false;
  const { start, end } = getSaoPauloWeekRange(now);
  const key = saoPauloDateKey(row.completed_at);
  return key >= start && key <= end;
};

export function summarizeInstallations(
  visibleAgenda: Installation[],
  visibleHistory: Installation[],
  waitingCount: number,
  now = new Date()
) {
  return {
    today: visibleAgenda.filter(row => isInstallationToday(row, now)).length,
    waiting: waitingCount,
    inProgress: visibleAgenda.filter(row => row.status === "IN_PROGRESS")
      .length,
    overdue: visibleAgenda.filter(row =>
      isScheduledInstallationOverdue(row, now)
    ).length,
    completedWeek: visibleHistory.filter(row =>
      isInstallationCompletedThisWeek(row, now)
    ).length,
  };
}

export const filterAgendaInstallations = (
  rows: Installation[],
  filter: AgendaQuickFilter,
  now = new Date()
) =>
  rows.filter(row => {
    if (filter === "today") return isInstallationToday(row, now);
    if (filter === "in_progress") return row.status === "IN_PROGRESS";
    if (filter === "overdue") return isScheduledInstallationOverdue(row, now);
    return true;
  });

export function sortWaitingOrders(
  rows: LogisticsOrder[],
  sort: "deadline" | "client" | "os"
) {
  return [...rows].sort((a, b) => {
    if (sort === "client")
      return a.client_name.localeCompare(b.client_name, "pt-BR");
    if (sort === "os")
      return (a.sale_number ?? "").localeCompare(b.sale_number ?? "", "pt-BR", {
        numeric: true,
      });
    if (!a.delivery_date) return b.delivery_date ? 1 : 0;
    if (!b.delivery_date) return -1;
    return a.delivery_date.localeCompare(b.delivery_date);
  });
}

export function filterHistoryInstallations(
  rows: Installation[],
  input: {
    search: string;
    status: HistoryStatus;
    period: HistoryPeriod;
    teamId: string;
  },
  now = new Date()
) {
  const query = input.search.trim().toLocaleLowerCase("pt-BR");
  const today = saoPauloDateKey(now.toISOString());
  const month = today.slice(0, 7);
  return rows.filter(row => {
    if (!["COMPLETED", "CANCELLED"].includes(row.status)) return false;
    if (input.status !== "all" && row.status !== input.status.toUpperCase())
      return false;
    if (input.teamId && row.team_id !== input.teamId) return false;
    const haystack =
      `${row.order?.sale_number ?? ""} ${row.order?.client_name ?? ""}`.toLocaleLowerCase(
        "pt-BR"
      );
    if (query && !haystack.includes(query)) return false;
    const eventKey = saoPauloDateKey(installationEventDate(row));
    if (input.period === "month" && !eventKey.startsWith(month)) return false;
    if (input.period === "week") {
      const { start, end } = getSaoPauloWeekRange(now);
      if (eventKey < start || eventKey > end) return false;
    }
    return true;
  });
}

export const formatInstallationTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
export const formatRouteDistance = (meters: number | null) =>
  meters == null
    ? "—"
    : meters < 1000
      ? `${Math.round(meters)} m`
      : `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
export const formatRouteDuration = (seconds: number | null) => {
  if (seconds == null) return "—";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours
    ? `${hours}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`
    : `${minutes}min`;
};
