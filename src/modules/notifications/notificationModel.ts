/**
 * PWA V4: projeção somente de leitura sobre eventos já autorizados por RLS.
 * Não concede acesso a módulos nem grava conteúdo operacional offline.
 */
export type NotificationKind =
  | "assignment"
  | "art_inbox"
  | "production_released"
  | "installation_scheduled"
  | "installation_rescheduled";

export type OperationalNotice = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  createdAt: string;
  href: string;
  orderId: string;
};

export type EventRow = {
  id: string;
  os_id: string;
  type: string;
  payload: unknown;
  created_at: string;
};

export type InstallationRow = {
  id: string;
  os_id: string;
  team_id: string | null;
  responsible_id: string | null;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationAudience = {
  userId: string;
  canViewArt: boolean;
  canViewProduction: boolean;
  canViewInstallations: boolean;
  isManager: boolean;
  teamIds: readonly string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const LIMIT = 40;

export function isOrderId(value: string): boolean {
  return UUID.test(value);
}

export function orderLabel(orderId: string, saleNumbers: Readonly<Record<string, string>>): string {
  const raw = saleNumbers[orderId]?.trim() ?? "";
  // Não exibe nome de cliente, endereço, arquivos ou mensagens privadas.
  return /^[0-9A-Za-z/_-]{1,25}$/.test(raw) ? "OS " + raw : "Ordem de serviço";
}

export function canSeeInstallation(row: InstallationRow, audience: NotificationAudience): boolean {
  return audience.canViewInstallations &&
    (audience.isManager ||
      row.responsible_id === audience.userId ||
      Boolean(row.team_id && audience.teamIds.includes(row.team_id)));
}

export function installationScheduleFingerprint(row: InstallationRow): string {
  return [row.scheduled_start, row.scheduled_end, row.team_id, row.responsible_id].join("|");
}

export function projectNotices(
  events: readonly EventRow[],
  installations: readonly InstallationRow[],
  audience: NotificationAudience,
  saleNumbers: Readonly<Record<string, string>>,
  changedInstallations: readonly InstallationRow[] = [],
  now = Date.now()
): OperationalNotice[] {
  const cutoff = now - LOOKBACK_MS;
  const notices: OperationalNotice[] = [];
  const add = (notice: OperationalNotice) => {
    if (!isOrderId(notice.orderId)) return;
    const timestamp = Date.parse(notice.createdAt);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now + 60_000) return;
    notices.push(notice);
  };
  for (const event of events) {
    if (!event || typeof event.payload !== "object" || event.payload === null || Array.isArray(event.payload)) continue;
    const payload = event.payload as Record<string, unknown>;
    const base = {
      id: "event:" + event.id,
      orderId: event.os_id,
      href: "/os/" + event.os_id,
      createdAt: event.created_at,
    };
    const label = orderLabel(event.os_id, saleNumbers);
    if (event.type === "assignee_changed" && payload.to === audience.userId) {
      const scope = typeof payload.scope === "string" ? payload.scope.toUpperCase() : "";
      add({ ...base, kind: "assignment", title: "Nova responsabilidade", description: label + (scope === "ART" ? " atribuída para Arte" : scope === "PRODUCTION" ? " atribuída para Produção" : " atribuída a você") });
    } else if (event.type === "create" && audience.canViewArt) {
      add({ ...base, kind: "art_inbox", title: "Nova OS na entrada de Arte", description: label + " criada e aguardando triagem" });
    } else if (
      event.type === "status_change" &&
      (payload.board === "arte" || payload.board === "art") &&
      payload.to === "Produzir" &&
      audience.canViewProduction
    ) {
      add({ ...base, kind: "production_released", title: "Liberada para produção", description: label + " passou de Arte para Produção" });
    }
  }

  const changedIds = new Set(changedInstallations.map(row => row.id));
  for (const row of installations) {
    if (!canSeeInstallation(row, audience) || !row.scheduled_start || row.status !== "SCHEDULED") continue;
    if (changedIds.has(row.id)) {
      add({
        id: "rescheduled:" + row.id + ":" + row.updated_at,
        kind: "installation_rescheduled",
        orderId: row.os_id,
        href: "/instalacoes",
        createdAt: row.updated_at,
        title: "Agendamento alterado",
        description: orderLabel(row.os_id, saleNumbers) + " teve horário ou equipe alterados",
      });
    }
    add({
      id: "scheduled:" + row.id,
      kind: "installation_scheduled",
      orderId: row.os_id,
      href: "/instalacoes",
      createdAt: row.created_at,
      title: "Instalação agendada",
      description: orderLabel(row.os_id, saleNumbers) + " incluída na agenda",
    });
  }
  return [...new Map(notices.map(item => [item.id, item])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, LIMIT);
}
