import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  CalendarX,
  ExternalLink,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  Search,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { updateOrderInsumos } from "@/features/hubos/api";
import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "@/modules/orders/risk";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  filterAwaitingSupplies,
  formatSupplyDeadlineStatus,
  formatWaitingLabel,
  isAwaitingSupplyOverdue,
  isAwaitingSupplyUrgent,
  reconcileAwaitingSupplySelection,
  sortAwaitingSupplies,
  summarizeAwaitingSupplies,
  type SuppliesFilter,
  type SuppliesSortMode,
} from "../presentation/awaitingSuppliesPresentation";
import { listAwaitingSuppliesOrders } from "../repositories/suppliesRepository";
import { runPendingReloadCycle } from "./pendingReloadCycle";

const formatDate = (value?: string | null) =>
  value
    ? new Date(
        value.includes("T") ? value : `${value}T12:00:00`
      ).toLocaleDateString("pt-BR")
    : "—";

function PageHeader({
  lastUpdatedAt,
  loading,
  busy,
  onRefresh,
}: {
  lastUpdatedAt: Date | null;
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-2xl font-semibold">Aguardando Insumos</h1>
        <p className="text-sm text-muted-foreground">
          Ordens de Serviço paradas por falta de material ou insumo.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lastUpdatedAt && (
          <span className="text-xs text-muted-foreground">
            Atualizado às{" "}
            {lastUpdatedAt.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={onRefresh}
        >
          <RefreshCw
            aria-hidden
            className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
        <Button
          asChild
          variant="outline"
          className={busy ? "pointer-events-none opacity-50" : ""}
        >
          <Link href="/os/producao/insumos" aria-disabled={busy}>
            Ver quadro de Produção
          </Link>
        </Button>
      </div>
    </header>
  );
}

const summaryDefinitions = [
  {
    value: "all",
    label: "Aguardando",
    key: "total",
    icon: PackageSearch,
    tone: "text-primary",
  },
  {
    value: "critical",
    label: "Críticas",
    key: "critical",
    icon: TriangleAlert,
    tone: "text-destructive",
  },
  {
    value: "urgent",
    label: "Urgentes",
    key: "urgent",
    icon: Zap,
    tone: "text-amber-600",
  },
  {
    value: "overdue",
    label: "Vencidas",
    key: "overdue",
    icon: CalendarX,
    tone: "text-destructive",
  },
] as const;

function SummaryCards({
  summary,
  filter,
  disabled,
  onFilter,
}: {
  summary: ReturnType<typeof summarizeAwaitingSupplies>;
  filter: SuppliesFilter;
  disabled: boolean;
  onFilter: (filter: SuppliesFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {summaryDefinitions.map(card => {
        const Icon = card.icon;
        const count = summary[card.key];
        return (
          <button
            key={card.value}
            type="button"
            disabled={disabled}
            aria-pressed={filter === card.value}
            onClick={() => onFilter(card.value)}
            className={`flex h-20 items-center justify-between rounded-lg border bg-card px-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${filter === card.value ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/40"}`}
          >
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-xl font-semibold">{count}</p>
            </div>
            <Icon
              aria-hidden
              className={`h-5 w-5 ${count === 0 ? "text-muted-foreground" : card.tone}`}
            />
          </button>
        );
      })}
    </div>
  );
}

function SupplyTimeline({ order }: { order: OsOrder }) {
  const hasPreviousResolution = Boolean(
    order.insumos_return_notes || order.insumos_resolved_at
  );
  if (!order.insumos_requested_at && !hasPreviousResolution) return null;
  return (
    <section aria-labelledby="supply-timeline-title">
      <h2 id="supply-timeline-title" className="mb-3 text-sm font-semibold">
        Histórico de insumos
      </h2>
      <ol className="space-y-3 border-l pl-4 text-sm">
        {order.insumos_requested_at && (
          <li className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.3rem] top-1 h-2 w-2 rounded-full bg-amber-500"
            />
            <p className="text-xs text-muted-foreground">
              {formatDate(order.insumos_requested_at)}
            </p>
            <p className="font-medium">Material solicitado</p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {order.insumos_details || "Material não detalhado."}
            </p>
          </li>
        )}
        {hasPreviousResolution && (
          <li className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.3rem] top-1 h-2 w-2 rounded-full bg-emerald-500"
            />
            <p className="text-xs text-muted-foreground">
              {formatDate(order.insumos_resolved_at)}
            </p>
            <p className="font-medium">Resolução anterior</p>
            {order.insumos_return_notes && (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {order.insumos_return_notes}
              </p>
            )}
          </li>
        )}
      </ol>
    </section>
  );
}

export default function AwaitingSuppliesPage() {
  const { hubPermissions } = useAuth();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const reloadPendingRef = useRef(false);
  const activeLoadPromiseRef = useRef<Promise<void> | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SuppliesFilter>("all");
  const [sortMode, setSortMode] = useState<SuppliesSortMode>("priority");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const busy = resolvingId !== null;
  const interactionLocked = busy || loading;

  const selectOrder = useCallback((id: string | null) => {
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    setDialogOpen(false);
    setNotes("");
  }, []);

  const fetchOrdersOnce = useCallback(async () => {
    const next = await listAwaitingSuppliesOrders();
    setOrders(next);
    setLastUpdatedAt(new Date());
  }, []);

  const load = useCallback(
    (silent = false): Promise<void> => {
      if (loadingRef.current) {
        reloadPendingRef.current = true;
        return activeLoadPromiseRef.current ?? Promise.resolve();
      }

      loadingRef.current = true;
      if (!silent) setLoading(true);

      const promise = (async () => {
        try {
          const lastError = await runPendingReloadCycle(
            fetchOrdersOnce,
            () => {
              reloadPendingRef.current = false;
            },
            () => reloadPendingRef.current
          );

          if (lastError) {
            const message =
              lastError instanceof Error
                ? lastError.message
                : "Não foi possível carregar os insumos.";
            setLoadError(message);
            toast.error(message);
          } else {
            setLoadError(null);
          }
        } finally {
          loadingRef.current = false;
          activeLoadPromiseRef.current = null;
          setLoading(false);
        }
      })();

      activeLoadPromiseRef.current = promise;
      return promise;
    },
    [fetchOrdersOnce]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), [orders]);
  const summary = useMemo(
    () => summarizeAwaitingSupplies(orders, now),
    [orders, now]
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const searched = orders.filter(
      order =>
        !term ||
        [
          order.sale_number,
          order.os_number,
          order.client_name,
          order.title,
          order.insumos_details,
        ].some(value =>
          String(value ?? "")
            .toLocaleLowerCase("pt-BR")
            .includes(term)
        )
    );
    return sortAwaitingSupplies(
      filterAwaitingSupplies(searched, filter, now),
      sortMode,
      now
    );
  }, [filter, now, orders, search, sortMode]);

  useEffect(() => {
    if (busy) return;
    selectOrder(
      reconcileAwaitingSupplySelection(
        selectedIdRef.current,
        visible.map(order => order.id)
      )
    );
  }, [busy, selectOrder, visible]);

  const selected = visible.find(order => order.id === selectedId) ?? null;

  const resolve = async () => {
    if (
      !selected ||
      notes.trim().length < 3 ||
      interactionLocked ||
      loadingRef.current
    )
      return;
    const orderId = selected.id;
    const resolutionNotes = notes.trim();
    setResolvingId(orderId);
    try {
      await updateOrderInsumos(orderId, "RESOLVE", resolutionNotes);
      toast.success("Insumo resolvido. OS retornada para Produção.");
      setDialogOpen(false);
      setNotes("");
      await load(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível resolver o insumo."
      );
    } finally {
      setResolvingId(null);
    }
  };

  const clearViewFilters = () => {
    if (interactionLocked) return;
    setFilter("all");
    setSearch("");
    setSortMode("priority");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        lastUpdatedAt={lastUpdatedAt}
        loading={loading}
        busy={busy}
        onRefresh={() => void load()}
      />

      {loading && orders.length === 0 ? (
        <div className="space-y-4" aria-label="Carregando Aguardando Insumos">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <Skeleton className="h-80" />
            <Skeleton className="h-[28rem]" />
          </div>
        </div>
      ) : loadError && orders.length === 0 ? (
        <Card className="mx-auto max-w-2xl border-dashed">
          <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <TriangleAlert aria-hidden className="h-10 w-10 text-destructive" />
            <div>
              <h2 className="font-semibold">
                Não foi possível carregar Aguardando Insumos.
              </h2>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
            <Button onClick={() => void load()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card className="mx-auto max-w-2xl border-dashed">
          <CardContent className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <PackageCheck aria-hidden className="h-10 w-10 text-emerald-600" />
            <div>
              <h2 className="font-semibold">Nenhuma OS aguardando insumos</h2>
              <p className="text-sm text-muted-foreground">
                A Produção não possui pendências de material neste momento.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/os/producao">Ver quadro de Produção</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryCards
            summary={summary}
            filter={filter}
            disabled={interactionLocked}
            onFilter={setFilter}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <Card className="self-start">
              <CardContent className="space-y-3 p-3">
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="Filtros rápidos"
                >
                  {summaryDefinitions.map(option => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={filter === option.value ? "default" : "outline"}
                      aria-pressed={filter === option.value}
                      disabled={interactionLocked}
                      onClick={() => setFilter(option.value)}
                    >
                      {option.label === "Aguardando" ? "Todas" : option.label}{" "}
                      {summary[option.key]}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      className="pl-9"
                      disabled={interactionLocked}
                      placeholder="Buscar por OS, cliente ou material..."
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                    />
                  </div>
                  <label className="sr-only" htmlFor="supplies-sort">
                    Ordenar por
                  </label>
                  <select
                    id="supplies-sort"
                    aria-label="Ordenar por"
                    disabled={interactionLocked}
                    value={sortMode}
                    onChange={event =>
                      setSortMode(event.target.value as SuppliesSortMode)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="priority">Prioridade</option>
                    <option value="oldest">Mais antigas</option>
                    <option value="newest">Mais recentes</option>
                    <option value="deadline">Prazo</option>
                  </select>
                </div>
                <div className="max-h-[calc(100vh-21rem)] space-y-2 overflow-y-auto pr-1">
                  {visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma OS encontrada para este filtro.
                      </p>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={interactionLocked}
                        onClick={clearViewFilters}
                      >
                        Limpar busca e filtros
                      </Button>
                    </div>
                  ) : (
                    visible.map(order => {
                      const overdue = isAwaitingSupplyOverdue(order, now);
                      const urgent = isAwaitingSupplyUrgent(order);
                      const critical =
                        calculateOrderRisk(order, now) === "CRITICO";
                      return (
                        <button
                          type="button"
                          key={order.id}
                          disabled={interactionLocked}
                          onClick={() => selectOrder(order.id)}
                          className={`relative w-full overflow-hidden rounded-lg border p-3 pl-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${selectedId === order.id ? "border-primary bg-primary/5" : ""}`}
                        >
                          <span
                            aria-hidden
                            className={`absolute inset-y-0 left-0 w-1 ${critical || overdue ? "bg-destructive" : urgent ? "bg-amber-500" : "bg-primary"}`}
                          />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <strong>OS #{order.sale_number}</strong>
                              <p className="truncate text-sm">
                                {order.client_name}
                              </p>
                            </div>
                            <OrderRiskBadge
                              risk={calculateOrderRisk(order, now)}
                            />
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-amber-800 dark:text-amber-300">
                            {order.insumos_details || "Material não detalhado"}
                          </p>
                          {(urgent || overdue) && (
                            <div className="mt-2 flex gap-1">
                              {urgent && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 text-[10px] text-amber-700"
                                >
                                  URGENTE
                                </Badge>
                              )}
                              {overdue && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  VENCIDA
                                </Badge>
                              )}
                            </div>
                          )}
                          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                            <p>{formatSupplyDeadlineStatus(order, now)}</p>
                            <p>{formatWaitingLabel(order, now)}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="self-start">
              <CardContent className="space-y-4 p-4 sm:p-5">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-semibold">
                            OS #{selected.sale_number}
                          </p>
                          <OrderRiskBadge
                            risk={calculateOrderRisk(selected, now)}
                          />
                        </div>
                        <p className="text-muted-foreground">
                          {selected.client_name}
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/os/${selected.id}`}>
                          Abrir OS{" "}
                          <ExternalLink
                            aria-hidden
                            className="ml-2 h-3.5 w-3.5"
                          />
                        </Link>
                      </Button>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
                      {[
                        ["Serviço", selected.title || "—"],
                        [
                          "Etapa",
                          selected.prod_status || selected.art_status || "—",
                        ],
                        ["Prazo", formatDate(selected.delivery_date)],
                        [
                          "Urgência",
                          isAwaitingSupplyUrgent(selected)
                            ? "Urgente"
                            : "Normal",
                        ],
                        ["Logística", selected.logistic_type || "—"],
                        [
                          "Solicitado em",
                          formatDate(selected.insumos_requested_at),
                        ],
                      ].map(([term, description]) => (
                        <div key={term}>
                          <dt className="text-xs text-muted-foreground">
                            {term}
                          </dt>
                          <dd className="capitalize">{description}</dd>
                        </div>
                      ))}
                    </dl>
                    <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="flex gap-3">
                        <PackageSearch
                          aria-hidden
                          className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                        />
                        <div>
                          <h2 className="text-xs font-semibold tracking-wide text-amber-900 dark:text-amber-200">
                            MATERIAL NECESSÁRIO
                          </h2>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950 dark:text-amber-100">
                            {selected.insumos_details ||
                              "Material não detalhado."}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-amber-200 pt-2 text-xs text-amber-900 dark:border-amber-900 dark:text-amber-200">
                        <span>
                          Solicitado em:{" "}
                          {formatDate(selected.insumos_requested_at)}
                        </span>
                        <span>{formatWaitingLabel(selected, now)}</span>
                      </div>
                    </section>
                    <section className="rounded-lg border p-3">
                      <h2 className="text-sm font-semibold">
                        O que precisa ser feito
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Providencie o material informado acima para que esta OS
                        possa retornar ao fluxo de Produção.
                      </p>
                      {isAwaitingSupplyOverdue(selected, now) && (
                        <p className="mt-1 text-sm font-medium text-destructive">
                          Esta OS já ultrapassou o prazo contratado.
                        </p>
                      )}
                      {isAwaitingSupplyUrgent(selected) && (
                        <p className="mt-1 text-sm font-medium text-amber-700">
                          Esta OS está marcada como urgente.
                        </p>
                      )}
                    </section>
                    <SupplyTimeline order={selected} />
                    {hubPermissions.canMoveProducaoBoard && (
                      <Button
                        disabled={interactionLocked}
                        onClick={() => setDialogOpen(true)}
                      >
                        Marcar insumo como resolvido
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Ajuste a busca ou os filtros para selecionar uma OS.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          if (!busy) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar insumo como resolvido</DialogTitle>
            <DialogDescription>
              Registre como o material foi disponibilizado. A OS será devolvida
              ao fluxo de Produção.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium">
            Como esta pendência foi resolvida?
            <Textarea
              disabled={busy}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              placeholder="Ex.: Material recebido do fornecedor e disponível para produção."
            />
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={notes.trim().length < 3 || busy}
              onClick={() => void resolve()}
            >
              {busy ? "Resolvendo..." : "Confirmar e retornar para Produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
