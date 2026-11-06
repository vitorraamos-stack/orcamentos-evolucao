import { supabase } from "@/lib/supabase";
import type { DashboardAgendaSources, DashboardDelivery, DashboardInstallation } from "./dashboardAgenda";

const PAGE_SIZE = 500;
const INSTALLATION_FIELDS =
  "id,os_id,team_id,responsible_id,status,scheduled_start,scheduled_end,estimated_duration_minutes,address_snapshot";
const DELIVERY_FIELDS = "id,os_id,mode,status,scheduled_at,assigned_to";

type AgendaAccess = {
  userId: string;
  isManager: boolean;
  canViewInstallations: boolean;
  canViewDeliveries: boolean;
};

/** Every permitted page, never just an arbitrary first N events. */
async function readPages(
  table: "os_installations" | "os_deliveries",
  projection: string,
  statuses: string[],
  signal?: AbortSignal
): Promise<unknown[]> {
  const result: Array<{ id: string }> = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table)
      .select(projection, { count: "exact" })
      .in("status", statuses)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    if (count === null || !Number.isSafeInteger(count) || count < 0)
      throw new Error("A contagem da agenda não pôde ser confirmada.");
    if (expected === null) expected = count;
    if (count !== expected) throw new Error("A agenda mudou durante a atualização.");
    const batch = (data ?? []) as unknown as Array<{ id: string }>;
    result.push(...batch);
    if (result.length >= expected) break;
    if (batch.length !== PAGE_SIZE) throw new Error("A leitura da agenda foi interrompida.");
  }
  if (result.length !== expected || new Set(result.map(row => row.id)).size !== expected)
    throw new Error("A agenda mudou durante a paginação.");
  return result;
}
async function readStable(
  table: "os_installations" | "os_deliveries",
  projection: string, statuses: string[], signal?: AbortSignal
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await readPages(table, projection, statuses, signal); }
    catch (error) {
      if (signal?.aborted || attempt === 1 ||
          !(error instanceof Error) || !/mudou|interrompida/.test(error.message)) throw error;
    }
  }
  throw new Error("A agenda não pôde ser confirmada.");
}

/**
 * Consults only modules the user can access. For non-managers, installation
 * visibility mirrors the existing Installations page: own responsibility/team.
 * Table RLS stays authoritative for every query.
 */
export async function listDashboardAgendaSources(
  access: AgendaAccess, signal?: AbortSignal
): Promise<DashboardAgendaSources> {
  if (!access.canViewInstallations && !access.canViewDeliveries) return {
    installations: [], deliveries: [],
    canViewInstallations: false, canViewDeliveries: false,
  };
  const installationsPromise = access.canViewInstallations
    ? readStable("os_installations", INSTALLATION_FIELDS, ["SCHEDULED", "IN_PROGRESS"], signal)
    : Promise.resolve([]);
  const deliveriesPromise = access.canViewDeliveries
    ? readStable("os_deliveries", DELIVERY_FIELDS, ["SCHEDULED", "IN_TRANSIT"], signal)
    : Promise.resolve([]);
  const membershipsPromise = access.canViewInstallations && !access.isManager
    ? (async () => {
      let query = supabase.from("os_installation_team_members")
        .select("team_id").eq("user_id", access.userId);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map(row => row.team_id));
    })()
    : Promise.resolve(new Set<string>());
  const [installationRows, deliveryRows, memberships] = await Promise.all([
    installationsPromise, deliveriesPromise, membershipsPromise,
  ]);
  const visibleInstallations = (installationRows as DashboardInstallation[]).filter(row =>
    access.isManager || row.responsible_id === access.userId ||
    (row.team_id !== null && memberships.has(row.team_id))
  );
  return {
    installations: visibleInstallations,
    deliveries: deliveryRows as DashboardDelivery[],
    canViewInstallations: access.canViewInstallations,
    canViewDeliveries: access.canViewDeliveries,
  };
}
