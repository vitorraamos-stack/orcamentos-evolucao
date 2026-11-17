import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, ClipboardList,
  FolderClock, ListTodo, Loader2, RefreshCw, Search, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentUserDisplayName } from "@/shared/users/userDisplay";
import { canAccessOperationalSection } from "@/lib/authz";
import { supabase } from "@/lib/supabase";
import { moveBoardOrder } from "@/shared/kanban/boardService";
import { ArtworkProductionLayoutDialog } from "@/modules/artwork/components/ArtworkProductionLayoutDialog";
import { setItemOperationStatus } from "@/modules/orders/repositories/orderDetailRepository";
import { listMyQueue } from "./myQueueRepository";
import {
  filterQueueRows, isActionable, isStageOverdue, isStageSoon, isOrderDeadlineRisk, localDateKey,
  queueMetrics, sortQueueRows, type MyQueueRow, type QueuePeriod, type QueueView,
} from "./myQueueModel";

const PAGE_SIZE = 12;
const BADGE: Record<string, string> = {
  TODO: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  IN_PROGRESS: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  WAITING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  BLOCKED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  DONE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};
const LABEL: Record<string, string> = {
  TODO: "A fazer", IN_PROGRESS: "Em andamento", WAITING: "Aguardando",
  BLOCKED: "Bloqueada", DONE: "Concluída",
};
const ACTION_LABEL: Record<string, string> = {
  START_ART: "Iniciar arte", SEND_APPROVAL: "Enviar para aprovação",
  RETAKE_ART: "Retomar arte", RELEASE_LAYOUT: "Enviar layout",
  START_OPERATION: "Iniciar", FINISH_OPERATION: "Concluir",
  OPEN_PRODUCTION: "Abrir produção", OPEN_INSTALLATION: "Abrir instalação",
  OPEN_OS: "Abrir OS",
};

function formatDue(value: string | null) {
  if (!value) return "Sem prazo";
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function duePresentation(row: MyQueueRow, today: string) {
  const label = row.dueKind === "order" ? "Prazo final da OS" :
    row.dueKind === "schedule" ? "Data agendada" : "Prazo da etapa";
  const state = isStageOverdue(row, today) ? "Atrasado" :
    isOrderDeadlineRisk(row, today) ? "OS em risco" :
    isStageSoon(row, today) ? "Próximo" : null;
  return { label, state };
}

function primaryButton(row: MyQueueRow) {
  return ACTION_LABEL[row.action] ?? "Abrir OS";
}

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
  const sectors = useMemo(() => [...new Set(rows.map(row => row.sector))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")), [rows]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const nextTask = useMemo(() => sortQueueRows(rows.filter(isActionable), today)[0] ?? null, [rows, today]);
  const waiting = useMemo(() => sortQueueRows(rows.filter(row => row.status === "WAITING"), today).slice(0, 4),
    [rows, today]);
  const upcoming = useMemo(() => sortQueueRows(rows.filter(row =>
    row.status !== "DONE" && row.dueDate && row.dueDate >= today), today).slice(0, 4), [rows, today]);
  const displayName = getCurrentUserDisplayName(user)?.split(" ")[0] ?? "você";

  function changeView(next: QueueView) { setView(next); setPage(1); }
  function changePeriod(next: QueuePeriod) { setPeriod(next); setPage(1); changeView("action"); }
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

  const metricCards = [
    { label: "Minhas pendências", number: metrics.pending, icon: ListTodo, tone: "text-sky-300",
      onClick: () => { changeView("action"); setPeriod("all"); } },
    { label: "Em atraso", number: metrics.overdue, icon: AlertTriangle, tone: "text-rose-300",
      onClick: () => changePeriod("overdue") },
    { label: "Próximos prazos", number: metrics.soon, icon: CalendarClock, tone: "text-amber-300",
      onClick: () => changePeriod("soon") },
    { label: "Aguardando", number: metrics.waiting, icon: Clock3, tone: "text-violet-300",
      onClick: () => { changeView("waiting"); setPeriod("all"); } },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1840px] flex-col gap-5 px-3 pb-10 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Minha Fila de Trabalho</h1>
          <p className="mt-1 text-sm text-muted-foreground">Olá, {displayName}! Aqui estão as atividades sob sua responsabilidade.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {updatedAt ? "Atualizado às " + updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          <Button variant="outline" size="sm" disabled={refreshing || loading} onClick={() => void reload(true)}>
            <RefreshCw className={"mr-2 h-4 w-4 " + (refreshing ? "animate-spin" : "")} />Atualizar
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metricCards.map(card => <button type="button" key={card.label} onClick={card.onClick}
          className="group rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
            <card.icon className={"h-4 w-4 " + card.tone} />{card.label}
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{card.number}</div>
        </button>)}
      </div>
      {nextTask && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <ListTodo className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Minha próxima atividade</p>
            <p className="text-sm font-semibold">{nextTask.activity} · OS #{nextTask.order.sale_number}</p>
            <p className="text-xs text-muted-foreground">{nextTask.order.client_name} · {formatDue(nextTask.dueDate)}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => void execute(nextTask)} disabled={Boolean(busyId)}>
          {primaryButton(nextTask)} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>}
      {metrics.orderRisk > 0 && <div role="status" className="rounded-lg border border-amber-600/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
        {metrics.orderRisk} atividade(s) também estão vinculadas a OS com prazo final vencido. Isso não é contado como atraso individual sem um prazo de etapa definido.
      </div>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
        <span>Não foi possível atualizar sua fila: {error}</span>
        <Button variant="outline" size="sm" onClick={() => void reload()}>Tentar novamente</Button>
      </div>}
      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Atividades atribuídas a mim" className="min-w-0 rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Visualização da fila">
              {([{ id: "action", title: "Precisa de mim" }, { id: "waiting", title: "Aguardando" },
                { id: "done", title: "Concluídas recentemente" }] as const).map(option =>
                <button key={option.id} type="button" onClick={() => changeView(option.id)}
                  aria-pressed={view === option.id}
                  className={"rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                    (view === option.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted")}>
                  {option.title}
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} atividade(s)</span>
          </div>
          <div className="grid gap-2 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_180px_150px]">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Buscar atividades" className="pl-9" value={search}
                placeholder="Buscar OS, cliente, produto ou atividade..." onChange={event => { setSearch(event.target.value); setPage(1); }} />
            </div>
            <select aria-label="Filtrar por setor" className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={sector} onChange={event => { setSector(event.target.value); setPage(1); }}>
              <option value="all">Todos os setores</option>
              {sectors.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Filtrar por prazo" className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={period} onChange={event => { setPeriod(event.target.value as QueuePeriod); setPage(1); }}>
              <option value="all">Todos os prazos</option>
              <option value="overdue">Atrasados / risco</option>
              <option value="today">Vencem hoje</option>
              <option value="soon">Próximos 3 dias úteis</option>
            </select>
          </div>
          {loading ? <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />Carregando sua fila...
          </div> : !shown.length ? <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="font-medium">{error ? "A fila não pôde ser carregada." : "Nenhuma atividade neste filtro."}</p>
            <p className="text-sm">{error ? "Use Tentar novamente para atualizar." :
              "Quando uma etapa for atribuída a você, ela aparecerá aqui."}</p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">OS / Cliente</th>
                  <th className="px-3 py-3 font-semibold">Produto / Atividade</th>
                  <th className="px-3 py-3 font-semibold">Etapa</th>
                  <th className="px-3 py-3 font-semibold">Prazo</th>
                  <th className="px-3 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map(row => {
                  const due = duePresentation(row, today);
                  return <tr key={row.id} className="transition-colors hover:bg-muted/20">
                    <td className="max-w-52 px-4 py-3 align-middle">
                      <Link href={"/os/" + row.orderId} className="font-semibold text-primary hover:underline">
                        OS #{row.order.sale_number || row.order.os_number || "—"}
                      </Link>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" title={row.order.client_name}>{row.order.client_name}</div>
                    </td>
                    <td className="max-w-64 px-3 py-3 align-middle">
                      <div className="font-medium">{row.activity}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" title={row.itemLabel ?? ""}>
                        {row.itemLabel || row.order.title || "Pedido sem descrição"}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle text-xs">{row.sector}</td>
                    <td className="px-3 py-3 align-middle">
                      <span className="font-medium tabular-nums">{formatDue(row.dueDate)}</span>
                      <div className="mt-0.5 text-xs text-muted-foreground">{due.label}</div>
                      {due.state && <div className={"mt-1 text-xs font-semibold " +
                        (due.state === "Atrasado" || due.state === "OS em risco" ? "text-rose-300" : "text-amber-300")}>
                        {due.state}</div>}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-medium " + BADGE[row.status]}>
                        {LABEL[row.status]}
                      </span>
                      {row.urgent && <div className="mt-1 text-xs font-medium text-amber-300">Prioridade alta</div>}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <Button size="sm" variant={row.action === "OPEN_OS" || row.action === "OPEN_PRODUCTION" ? "outline" : "default"}
                        disabled={Boolean(busyId)} onClick={() => void execute(row)}>
                        {busyId === row.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                        {primaryButton(row)}
                      </Button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>Exibindo {filtered.length ? (Math.min(page, pageCount) - 1) * PAGE_SIZE + 1 : 0}–{Math.min(Math.min(page, pageCount) * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Próxima</Button>
            </div>
          </div>
        </section>
        <aside className="space-y-4" aria-label="Resumo da fila">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><FolderClock className="h-4 w-4 text-amber-300" />Aguardando terceiros</div>
            {waiting.length ? <div className="space-y-3">{waiting.map(row =>
              <Link key={row.id} href={"/os/" + row.orderId} className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
                <span className="text-xs font-semibold text-primary">OS #{row.order.sale_number}</span>
                <p className="mt-1 text-sm font-medium">{row.activity}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.order.client_name}</p>
              </Link>
            )}</div> : <p className="text-sm text-muted-foreground">Nenhuma atividade aguardando.</p>}
            <button className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              onClick={() => { changeView("waiting"); setPeriod("all"); }} type="button">Ver aguardando <ArrowRight className="h-3 w-3" /></button>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-sky-300" />Próximos vencimentos</div>
            {upcoming.length ? <div className="space-y-3">{upcoming.map(row =>
              <Link key={row.id} href={"/os/" + row.orderId} className="block border-b border-border pb-3 last:border-0 last:pb-0">
                <span className="text-xs text-muted-foreground">{formatDue(row.dueDate)} · {row.dueKind === "order" ? "Prazo da OS" : "Etapa"}</span>
                <p className="text-sm font-medium">{row.activity}</p>
                <p className="text-xs text-muted-foreground">OS #{row.order.sale_number}</p>
              </Link>
            )}</div> : <p className="text-sm text-muted-foreground">Nenhum vencimento registrado.</p>}
          </div>
          <Link href="/os" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-muted/30">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />Central de Ordens de Serviço</span><ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </div>
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
    </main>
  );
}
