import { supabase } from "@/lib/supabase";
import type { EventRow, InstallationRow } from "./notificationModel";

export type NotificationSnapshot = {
  events: EventRow[];
  installations: InstallationRow[];
  teamIds: string[];
  saleNumbers: Record<string, string>;
};

/** Consultas somente de leitura, sempre sujeitas ao RLS do Supabase. */
export async function loadNotificationSnapshot(
  userId: string,
  canViewInstallations: boolean
): Promise<NotificationSnapshot> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsResult, installationResult, teamsResult, assigneesResult] = await Promise.all([
    supabase.from("os_orders_event")
      .select("id,os_id,type,payload,created_at")
      .in("type", ["assignee_changed", "status_change", "create"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(150),
    canViewInstallations
      ? supabase.from("os_installations")
          .select("id,os_id,team_id,responsible_id,status,scheduled_start,scheduled_end,created_at,updated_at")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    canViewInstallations
      ? supabase.from("os_installation_team_members").select("team_id").eq("user_id", userId)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("os_order_assignees").select("order_id").eq("user_id", userId),
  ]);

  if (eventsResult.error) throw new Error("Não foi possível consultar os avisos das OS.");
  if (installationResult.error) throw new Error("Não foi possível consultar a agenda de instalações.");
  if (teamsResult.error) throw new Error("Não foi possível consultar os responsáveis pelas instalações.");
  if (assigneesResult.error) throw new Error("Não foi possível consultar as atribuições da OS.");

  const events = (eventsResult.data ?? []) as EventRow[];
  const installations = (installationResult.data ?? []) as InstallationRow[];
  const teamIds = (teamsResult.data ?? []).map(row => String(row.team_id));

  const orderIds = Array.from(new Set([
    ...events.map(row => row.os_id),
    ...installations.map(row => row.os_id),
  ])).filter(Boolean);

  if (!orderIds.length) return { events: [], installations: [], teamIds, saleNumbers: {} };

  // O RLS da OS determina quais itens podem aparecer na central.
  const ordersResult = await supabase.from("os_orders")
    .select("id,sale_number,created_at,updated_at,art_status,archived")
    .in("id", orderIds)
    .eq("archived", false);

  if (ordersResult.error) throw new Error("Não foi possível verificar a visibilidade das OS.");

  const visibleIds = new Set((ordersResult.data ?? []).map(row => String(row.id)));
  const visibleOrders = new Map((ordersResult.data ?? []).map(row => [String(row.id), row]));
  const ownAssignments = new Set((assigneesResult.data ?? []).map(row => String(row.order_id)));
  // Eventos de auditoria podem receber INSERT de usuários autenticados.
  // Nunca confiar isoladamente no payload para criar avisos de atribuição.
  const sourceIsConsistent = (event: EventRow): boolean => {
    const order = visibleOrders.get(event.os_id);
    if (!order) return false;
    if (event.type === "assignee_changed") {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : null;
      return payload?.to === userId && ownAssignments.has(event.os_id);
    }
    if (event.type === "create") {
      return Math.abs(Date.parse(order.created_at) - Date.parse(event.created_at)) < 5 * 60 * 1000;
    }
    if (event.type === "status_change") {
      return Date.parse(event.created_at) <= Date.parse(order.updated_at) + 2 * 60 * 1000 &&
        order.art_status === "Produzir";
    }
    return false;
  };
  const saleNumbers: Record<string, string> = {};
  for (const row of ordersResult.data ?? []) {
    if (row.sale_number) saleNumbers[String(row.id)] = String(row.sale_number);
  }

  return {
    events: events.filter(event => visibleIds.has(event.os_id) && sourceIsConsistent(event)),
    installations: installations.filter(item => visibleIds.has(item.os_id)),
    teamIds,
    saleNumbers,
  };
}
