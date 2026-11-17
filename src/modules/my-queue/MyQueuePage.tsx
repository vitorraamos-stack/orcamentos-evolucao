import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessOperationalSection } from "@/lib/authz";
import { supabase } from "@/lib/supabase";
import { moveBoardOrder } from "@/shared/kanban/boardService";
import { ArtworkProductionLayoutDialog } from "@/modules/artwork/components/ArtworkProductionLayoutDialog";
import { setItemOperationStatus } from "@/modules/orders/repositories/orderDetailRepository";
import { listMyQueue } from "./myQueueRepository";
import MyQueueReferenceView from "./MyQueueReferenceView";
import {
  filterQueueRows, localDateKey, queueMetrics, type MyQueueRow, type QueuePeriod, type QueueView,
} from "./myQueueModel";

const PAGE_SIZE = 12;

export default function MyQueuePage() {
  const { user, hubRole, hubPermissions, hasModuleAccess } = useAuth();
  const [, navigate] = useLocation();
  const userId = user?.id ?? null;
  const allowInstallations = canAccessOperationalSection({
    permissions: hubPermissions, hasModuleAccess,
  }, "installations");
  const [rows, setRows] = useState<MyQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [view, setView] = useState<QueueView>("action");
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [period, setPeriod] = useState<QueuePeriod>("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [layoutRow, setLayoutRow] = useState<MyQueueRow | null>(null);
  const generation = useRef(0);
  const today = localDateKey(new Date());

  const reload = useCallback(async (silent = false) => {
    if (!userId) return;
    const version = ++generation.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await listMyQueue(userId, allowInstallations);
      if (generation.current !== version) return;
      setRows(next);
      setError(null);
      setUpdatedAt(new Date());
    } catch (cause) {
      if (generation.current !== version) return;
      setError(cause instanceof Error ? cause.message : "Falha ao carregar sua fila.");
    } finally {
      if (generation.current === version) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId, allowInstallations]);

  useEffect(() => {
    setRows([]);
    setLoading(true);
    generation.current++;
    void reload();
    return () => { generation.current++; };
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => { void reload(true); }, 120_000);
    const visible = () => { if (document.visibilityState === "visible") void reload(true); };
    document.addEventListener("visibilitychange", visible);
    let pending: number | undefined;
    const schedule = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => { void reload(true); }, 600);
    };
    const channel = supabase.channel("my-queue-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_orders" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_order_assignees" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_order_item_operations" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "os_installations" }, schedule)
      .subscribe();
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(pending);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  const metrics = useMemo(() => queueMetrics(rows, today), [rows, today]);
  const filtered = useMemo(() => filterQueueRows(rows, { view, search, sector, period, today }),
    [rows, view, search, sector, period, today]);
  const sectors = useMemo(() => Array.from(new Set(rows.map(row => row.sector))).sort((a, b) =>
    a.localeCompare(b, "pt-BR")), [rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  function changeView(next: QueueView) { setView(next); setPage(1); }
  function openOrder(row: MyQueueRow, production = false) {
    navigate("/os/" + row.orderId + (production ? "?tab=production" : ""));
  }

  const execute = async (row: MyQueueRow) => {
    if (busyId) return;
    if (row.action === "OPEN_OS") return openOrder(row);
    if (row.action === "OPEN_PRODUCTION") return openOrder(row, true);
    if (row.action === "OPEN_INSTALLATION") {
      navigate(row.installationId ? "/instalacoes/execucao/" + row.installationId : "/instalacoes");
      return;
    }
    if (row.action === "RELEASE_LAYOUT") {
      if (!hubPermissions.canMoveArteBoard) return toast.error("Seu perfil não pode liberar Arte.");
      if (!row.order.delivery_deadline_preset ||
        (row.order.delivery_deadline_preset === "CUSTOM" && !row.order.delivery_date))
        return toast.error("Defina o prazo de produção na OS antes de liberar o layout.");
      setLayoutRow(row);
      return;
    }
    setBusyId(row.id);
    try {
      if (row.action === "START_OPERATION" || row.action === "FINISH_OPERATION") {
        if (!hubPermissions.canMoveProducaoBoard || !row.operation)
          throw new Error("Você não tem permissão para executar esta operação.");
        await setItemOperationStatus(row.operation.id,
          row.action === "START_OPERATION" ? "IN_PROGRESS" : "COMPLETED",
          row.operation.updated_at);
      } else {
        if (!hubPermissions.canMoveArteBoard) throw new Error("Você não tem permissão para movimentar Arte.");
        const to = row.action === "SEND_APPROVAL" ? "Para Aprovação" : "Em Criação";
        await moveBoardOrder({
          order: row.order, board: "art", to, role: hubRole, isManager: hubPermissions.isManager,
        });
      }
      toast.success("Atividade atualizada.");
      await reload(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível atualizar a atividade.");
      await reload(true);
    } finally { setBusyId(null); }
  };

  return (
    <>
      <MyQueueReferenceView
        rows={rows}
        filtered={filtered}
        metrics={metrics}
        today={today}
        view={view}
        search={search}
        sector={sector}
        sectors={sectors}
        period={period}
        page={page}
        pageCount={pageCount}
        shown={shown}
        loading={loading}
        refreshing={refreshing}
        error={error}
        busyId={busyId}
        updatedAt={updatedAt}
        onView={changeView}
        onSector={value => { setSector(value); setPage(1); }}
        onPeriod={value => { setPeriod(value); setPage(1); }}
        onSearch={value => { setSearch(value); setPage(1); }}
        onPage={setPage}
        onRefresh={() => { void reload(true); }}
        onExecute={row => { void execute(row); }}
      />
      <ArtworkProductionLayoutDialog
        key={layoutRow?.orderId ?? "closed"}
        order={layoutRow?.order ?? null}
        userId={userId}
        open={Boolean(layoutRow)}
        onOpenChange={open => { if (!open) setLayoutRow(null); }}
        onConfirm={async (order, asset) => {
          if (!layoutRow || layoutRow.orderId !== order.id || order.art_status !== "Para Aprovação") {
            toast.error("A etapa atual da OS mudou. Atualize a fila.");
            return false;
          }
          try {
            await moveBoardOrder({ order, board: "art", to: "Produzir",
              role: hubRole, isManager: hubPermissions.isManager, layoutAsset: asset });
            toast.success("Layout enviado e OS liberada para Produção.");
            await reload(true);
            return true;
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Não foi possível liberar a OS.");
            await reload(true);
            return false;
          }
        }}
      />
    </>
  );
}
