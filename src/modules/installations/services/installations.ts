import type {
  Installation,
  InstallationStatus,
  LogisticsOrder,
  InstallationActions,
} from "../types";
export const INSTALLATION_STATUS_LABEL: Record<InstallationStatus, string> = {
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em execução",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};
import {
  SAO_PAULO_TIME_ZONE,
  saoPauloDateKey,
} from "@/shared/lib/saoPauloTime";
export { SAO_PAULO_TIME_ZONE };
export const formatAgendaDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
export const installationOrderLabel = (installation: Installation) => ({
  number: installation.order?.sale_number || "sem número",
  client: installation.order?.client_name || "Cliente não informado",
});
export const installationEventDate = (installation: Installation) =>
  installation.completed_at ||
  installation.cancelled_at ||
  installation.updated_at ||
  installation.scheduled_start;
export const sortInstallationHistory = (rows: Installation[]) =>
  [...rows].sort(
    (a, b) =>
      new Date(installationEventDate(b)).getTime() -
      new Date(installationEventDate(a)).getTime()
  );
export function getInstallationActions(input: {
  status: InstallationStatus;
  canExecute: boolean;
  isManager: boolean;
}): InstallationActions {
  const active = input.status === "SCHEDULED" || input.status === "IN_PROGRESS";
  return {
    canStart: input.canExecute && input.status === "SCHEDULED",
    canComplete:
      input.canExecute &&
      (input.status === "IN_PROGRESS" ||
        (input.isManager && input.status === "SCHEDULED")),
    canCancel: input.isManager && active,
    canReschedule: input.isManager && input.status === "SCHEDULED",
  };
}
export const selectPrimaryInstallation = (rows: Installation[]) =>
  [...rows].sort((a, b) => {
    const activeA = ["SCHEDULED", "IN_PROGRESS"].includes(a.status) ? 1 : 0;
    const activeB = ["SCHEDULED", "IN_PROGRESS"].includes(b.status) ? 1 : 0;
    return (
      activeB - activeA ||
      new Date(b.created_at || b.scheduled_start).getTime() -
        new Date(a.created_at || a.scheduled_start).getTime()
    );
  })[0] ?? null;
export const getInstallationDetails = (
  installation: Installation,
  orderAddress?: string | null
) => ({
  status: INSTALLATION_STATUS_LABEL[installation.status],
  team: installation.team?.name ?? "Sem equipe definida",
  responsible:
    installation.responsible?.name ||
    installation.responsible?.email ||
    "Responsável não definido",
  vehicle: installation.vehicle_label || "Não definido",
  address:
    installation.address_snapshot || orderAddress || "Endereço não informado",
  startedAt: installation.started_at,
  completedAt: installation.completed_at,
  cancelledAt: installation.cancelled_at,
  cancelledReason: installation.cancelled_reason,
});
export function buildWazeUrl(input: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const url = new URL("https://www.waze.com/ul");
  const address = input.address?.trim();
  if (address) url.searchParams.set("q", address);
  else if (input.lat != null && input.lng != null)
    url.searchParams.set("ll", `${input.lat},${input.lng}`);
  else url.searchParams.set("q", "");
  url.searchParams.set("navigate", "yes");
  return url.toString();
}
export const buildMapsUrl = (i: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.address?.trim() || (i.lat != null && i.lng != null ? `${i.lat},${i.lng}` : ""))}`;
export function groupInstallationsByDay(rows: Installation[]) {
  const groups = rows.reduce<Record<string, Installation[]>>((groups, row) => {
    const day = saoPauloDateKey(row.scheduled_start);
    (groups[day] ??= []).push(row);
    return groups;
  }, {});
  Object.values(groups).forEach(dayRows =>
    dayRows.sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() -
        new Date(b.scheduled_start).getTime()
    )
  );
  return groups;
}
export const isMyInstallation = (
  row: Installation,
  userId: string,
  teamIds: string[]
) =>
  row.responsible_id === userId ||
  Boolean(row.team_id && teamIds.includes(row.team_id));
export const isWaitingInstallation = (
  order: LogisticsOrder,
  activeIds: Set<string>
) =>
  order.logistic_type === "instalacao" &&
  order.prod_status === "Pronto / Avisar Cliente" &&
  !order.archived &&
  !activeIds.has(order.id);
export const isLegacyInstallation = (
  order: LogisticsOrder,
  activeIds: Set<string>
) =>
  order.logistic_type === "instalacao" &&
  order.prod_status === "Instalação Agendada" &&
  !activeIds.has(order.id);
