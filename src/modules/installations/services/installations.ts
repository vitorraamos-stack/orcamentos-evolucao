import type {
  Installation,
  InstallationStatus,
  LogisticsOrder,
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
  return rows.reduce<Record<string, Installation[]>>((groups, row) => {
    const day = saoPauloDateKey(row.scheduled_start);
    (groups[day] ??= []).push(row);
    return groups;
  }, {});
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
