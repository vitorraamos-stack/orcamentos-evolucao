import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { listOrderFlowState } from "@/modules/hub-os/order-flow-api";
import {
  countOpenDeliveries,
  countOpenInstallations,
  type PendingDelivery,
  type PendingInstallation,
  type PendingOrder,
} from "./logisticsPendingCounts";

type Access = {
  userId: string | null;
  canViewInstallations: boolean;
  canViewDeliveries: boolean;
  isManager: boolean;
  agendaOnly: boolean;
};
export type LogisticsPendingCounts = { installations: number | null; deliveries: number | null };
const EMPTY: LogisticsPendingCounts = { installations: null, deliveries: null };
const PAGE_SIZE = 500;

// Paginar em vez de confiar no limite padrão de linhas do PostgREST.
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

async function readInstallations(access: Access): Promise<number> {
  const activePromise = readAll<PendingInstallation>((from, to) =>
    supabase.from("os_installations")
      .select("os_id,team_id,responsible_id")
      .in("status", ["SCHEDULED", "IN_PROGRESS"])
      .order("os_id").range(from, to)
  );
  const ordersPromise = access.agendaOnly
    ? Promise.resolve([] as PendingOrder[])
    : readAll<PendingOrder>((from, to) =>
      supabase.from("os_orders")
        .select("id,logistic_type,prod_status,archived")
        .eq("logistic_type", "instalacao").eq("archived", false)
        .in("prod_status", ["Pronto / Avisar Cliente", "Instalação Agendada"])
        .order("id").range(from, to)
    );
  const membershipsPromise = access.isManager || access.agendaOnly
    ? Promise.resolve([] as Array<{ team_id: string }>)
    : readAll<{ team_id: string }>((from, to) =>
      supabase.from("os_installation_team_members")
        .select("team_id").eq("user_id", access.userId!)
        .order("team_id").range(from, to)
    );
  const [active, orders, memberships] = await Promise.all([
    activePromise, ordersPromise, membershipsPromise,
  ]);
  return countOpenInstallations({
    active, orders, userId: access.userId!, isManager: access.isManager,
    agendaOnly: access.agendaOnly, teamIds: new Set(memberships.map(row => row.team_id)),
  });
}

async function readDeliveries(): Promise<number> {
  const [active, orders] = await Promise.all([
    readAll<PendingDelivery>((from, to) =>
      supabase.from("os_deliveries")
        .select("os_id").in("status", ["SCHEDULED", "IN_TRANSIT"])
        .order("os_id").range(from, to)
    ),
    readAll<PendingOrder>((from, to) =>
      supabase.from("os_orders")
        .select("id,logistic_type,prod_status,archived")
        .in("logistic_type", ["entrega", "retirada"])
        .eq("archived", false)
        .in("prod_status", ["Pronto / Avisar Cliente", "Logística (Entrega/Transportadora)", "Finalizados"])
        .order("id").range(from, to)
    ),
  ]);
  // O mesmo RPC seguro usado pela Central de Entregas confirma as retiradas.
  const hasPickups = orders.some(row =>
    row.logistic_type === "retirada" &&
    ["Pronto / Avisar Cliente", "Finalizados"].includes(row.prod_status ?? "")
  );
  const flows = hasPickups ? await listOrderFlowState() : [];
  return countOpenDeliveries({ active, orders, flows });
}

/** Badges exibidas somente quando a contagem é conhecida e maior que zero. */
export function useLogisticsPendingCounts(access: Access): LogisticsPendingCounts {
  const [counts, setCounts] = useState<LogisticsPendingCounts>(EMPTY);
  const { userId, canViewInstallations, canViewDeliveries, isManager, agendaOnly } = access;

  useEffect(() => {
    if (!userId || (!canViewInstallations && !canViewDeliveries)) {
      setCounts(EMPTY);
      return;
    }

    let disposed = false;
    let running = false;
    let rerun = false;
    setCounts(EMPTY);

    const refresh = async () => {
      if (running) { rerun = true; return; }
      running = true;
      const current: Access = { userId, canViewInstallations, canViewDeliveries, isManager, agendaOnly };
      const results = await Promise.allSettled([
        canViewInstallations ? readInstallations(current) : Promise.resolve(null),
        canViewDeliveries ? readDeliveries() : Promise.resolve(null),
      ]);
      if (!disposed) setCounts({
        installations: results[0].status === "fulfilled" ? results[0].value : null,
        deliveries: results[1].status === "fulfilled" ? results[1].value : null,
      });
      running = false;
      if (!disposed && rerun) { rerun = false; void refresh(); }
    };
    const requestRefresh = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") requestRefresh(); };
    const subscription = supabase.channel(`sidebar-logistics-pending-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_orders" }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_installations" }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_installation_team_members" }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_deliveries" }, requestRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "hub_os_order_flow_state" }, requestRefresh)
      .subscribe();
    const interval = window.setInterval(requestRefresh, 120_000);
    window.addEventListener("focus", requestRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", requestRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(subscription);
    };
  }, [userId, canViewInstallations, canViewDeliveries, isManager, agendaOnly]);

  return counts;
}
