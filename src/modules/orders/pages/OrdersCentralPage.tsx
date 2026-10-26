import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Filter, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import "./orders-central.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ART_COLUMNS, PROD_COLUMNS } from "@/features/hubos/constants";
import type { LogisticType, OsOrder } from "@/features/hubos/types";
import { createOrderPath } from "@/features/hubos/createOrderNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  listOperationalOrders,
  listOperationalOrderSummaryRows,
} from "../orderRepository";
import type { QuickOrderFilter } from "../orderFilters";
import { parseQuickFilterFromSearch } from "../quickFilterSearch";
import { OrderSearch } from "../components/OrderSearch";
import { OrderTable } from "../components/OrderTable";
import { OrdersListRecovery } from "../components/OrdersListRecovery";
import { OrdersSummaryCards } from "../components/OrdersSummaryCards";
import { summarizeOrders } from "../orderSummary";
import { PageHeader } from "@/shared/components/OperationalUi";
import { boundedCentralLookup } from "../centralReturnDeadline";
import {
  centralSessionStorage, clearCentralReturn, consumeCentralReturn,
  readCentralReturn, saveCentralReturn,
} from "../centralReturnContext";

const PAGE_SIZE = 25;
const quickFilters: Array<[QuickOrderFilter, string]> = [
  ["all", "Todas"],
  ["active", "Em andamento"],
  ["overdue", "Atrasadas"],
  ["finished", "Finalizadas"],
];

// Preserve existing deep links and operational subsets without adding
// more than the four approved quick-filter controls.
const extraQuickFilters: Array<[QuickOrderFilter, string]> = [
  ["today", "Hoje"],
  ["tomorrow", "Amanhã"],
  ["week", "Esta semana"],
  ["pending", "Pendentes"],
  ["urgent", "Urgentes"],
];
const isExtraQuickFilter = (value: QuickOrderFilter) =>
  extraQuickFilters.some(([key]) => key === value);

function initialQuickFilter() {
  return typeof window === "undefined"
    ? "all"
    : parseQuickFilterFromSearch(window.location.search);
}

// Provisional. Re-evaluate this limit with real-world performance evidence.
const RETURN_LOOKUP_TIMEOUT_MS = 5000;

function OrdersLoading() {
  return (
    <div aria-label="Carregando ordens" role="status" className="space-y-4">
      <p className="sr-only">Carregando a consulta de ordens de serviço.</p>
      <div aria-hidden="true">
        <Skeleton className="mb-4 h-16 rounded-xl" />
        <div className="space-y-2 rounded-xl border p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrdersCentralPage() {
  const { user, hubPermissions } = useAuth();
  const [returnContext] = useState(() =>
    typeof window === "undefined" || !hubPermissions.canViewHubOS
      ? null
      : readCentralReturn(centralSessionStorage(), user?.id, window.location.search, Date.now())
  );
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [summaryOrders, setSummaryOrders] = useState<OsOrder[]>([]);
  const [summaryTotal, setSummaryTotal] = useState<number | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"loading" | "ready" | "error">("loading");
  const summaryRequestId = useRef(0);
  const listRequestId = useRef(0);
  const returnOrderIdRef = useRef(returnContext?.orderId ?? null);
  const returnAbortRef = useRef<AbortController | null>(null);
  const skipOnePageFetchRef = useRef<number | null>(null);
  const pendingAnchorFocusRef = useRef<string | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState("");
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusResultsAfterRetry = useRef(false);
  const [total, setTotal] = useState<number | null>(null);
  const [listUpdatedAt, setListUpdatedAt] = useState<Date | null>(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState<Date | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [searchEditVersion, setSearchEditVersion] = useState(0);
  const [searchCommittedVersion, setSearchCommittedVersion] = useState(0);
  const [page, setPage] = useState(returnContext?.page ?? 1);
  const [search, setSearch] = useState(returnContext?.search ?? "");
  const [query, setQuery] = useState(returnContext?.search ?? "");
  const [quick, setQuick] = useState<QuickOrderFilter>(returnContext?.quick ?? initialQuickFilter);
  const [artStatus, setArtStatus] = useState(returnContext?.artStatus ?? "all");
  const [prodStatus, setProdStatus] = useState(returnContext?.prodStatus ?? "all");
  const [priority, setPriority] = useState(returnContext?.priority ?? "all");
  const [logistics, setLogistics] = useState(returnContext?.logistics ?? "all");
  const [draftQuick, setDraftQuick] =
    useState<QuickOrderFilter>(returnContext?.quick ?? initialQuickFilter);
  const [draftArtStatus, setDraftArtStatus] = useState("all");
  const [draftProdStatus, setDraftProdStatus] = useState("all");
  const [draftPriority, setDraftPriority] = useState("all");
  const [draftLogistics, setDraftLogistics] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const advancedCount = [artStatus, prodStatus, priority, logistics].filter(
    value => value !== "all"
  ).length + (isExtraQuickFilter(quick) ? 1 : 0);
  const hasFilters = Boolean(search || quick !== "all" || advancedCount);
  const hasDraftChanges =
    draftQuick !== quick ||
    draftArtStatus !== artStatus ||
    draftProdStatus !== prodStatus ||
    draftPriority !== priority ||
    draftLogistics !== logistics;

  useEffect(() => {
    if (returnContext) consumeCentralReturn(centralSessionStorage(), returnContext);
    else clearCentralReturn(centralSessionStorage());
  }, [returnContext]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (quick === "all") url.searchParams.delete("quick");
    else url.searchParams.set("quick", quick);
    window.history.replaceState(window.history.state, "", url);
  }, [quick]);

  // Invalidate as soon as the user changes a committed criterion (or types),
  // before the 350 ms debounce can complete or a previous response can arrive.
  const invalidateList = () => {
    returnOrderIdRef.current = null;
    returnAbortRef.current?.abort();
    returnAbortRef.current = null;
    pendingAnchorFocusRef.current = null;
    setHighlightOrderId(null);
    setReturnNotice("");
    listRequestId.current += 1;
    focusResultsAfterRetry.current = false;
    setOrders([]);
    setTotal(null);
    setListUpdatedAt(null);
    setError("");
    setLoading(true);
  };
  const handleSearchChange = (value: string) => {
    if (value === search) return;
    invalidateList();
    setSearch(value);
    setSearchEditVersion(value => value + 1);
  };
  const clearFilters = () => {
    invalidateList();
    setSearch("");
    setQuery("");
    setQuick("all");
    setArtStatus("all");
    setProdStatus("all");
    setPriority("all");
    setLogistics("all");
    setDraftQuick("all");
    setDraftArtStatus("all");
    setDraftProdStatus("all");
    setDraftPriority("all");
    setDraftLogistics("all");
    setPage(1);
  };
  const handleFiltersOpenChange = (open: boolean) => {
    if (open) {
      setDraftQuick(quick);
      setDraftArtStatus(artStatus);
      setDraftProdStatus(prodStatus);
      setDraftPriority(priority);
      setDraftLogistics(logistics);
    }
    setFiltersOpen(open);
  };
  const clearDraftFilters = () => {
    setDraftQuick("all");
    setDraftArtStatus("all");
    setDraftProdStatus("all");
    setDraftPriority("all");
    setDraftLogistics("all");
  };
  const applyDraftFilters = () => {
    if (hasDraftChanges || page !== 1) invalidateList();
    setQuick(draftQuick);
    setArtStatus(draftArtStatus);
    setProdStatus(draftProdStatus);
    setPriority(draftPriority);
    setLogistics(draftLogistics);
    setPage(1);
    setFiltersOpen(false);
  };
  const load = (retryInPlace = false) => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    if (!retryInPlace) {
      setError("");
      setOrders([]);
      setTotal(null);
      setListUpdatedAt(null);
    }
    const args = {
      page,
      pageSize: PAGE_SIZE,
      search: query,
      artStatus: artStatus === "all" ? undefined : artStatus,
      prodStatus: prodStatus === "all" ? undefined : prodStatus,
      urgent: priority === "all" ? undefined : priority === "urgent",
      logisticType:
        logistics === "all" ? undefined : (logistics as LogisticType),
      quickFilter: quick,
    };
    const returnTarget = returnOrderIdRef.current;
    let timedOut = false;
    const fetchPage = async () => {
      if (!returnTarget) return listOperationalOrders(args);
      const controller = new AbortController();
      returnAbortRef.current = controller;
      try {
        const outcome = await boundedCentralLookup(
          signal => listOperationalOrders({ ...args, locateOrderId: returnTarget, signal }),
          controller,
          RETURN_LOOKUP_TIMEOUT_MS
        );
        if (outcome.status === "found") return outcome.value;
        timedOut = true;
        // Never await the expired location attempt. A late reply cannot move
        // the UI; the fallback validates the same filters and permissions.
        return await listOperationalOrders(args);
      } finally {
        if (returnAbortRef.current === controller) returnAbortRef.current = null;
      }
    };
    void fetchPage()
      .then(result => {
        if (requestId !== listRequestId.current) return;
        returnOrderIdRef.current = null;
        if (returnTarget) {
          if (timedOut) {
            setReturnNotice("Não foi possível recuperar a posição anterior. Os filtros foram preservados.");
          } else if (result.locatedOrderId === returnTarget) {
            pendingAnchorFocusRef.current = returnTarget;
            setHighlightOrderId(returnTarget);
            setReturnNotice("");
          } else {
            setReturnNotice("A ordem visualizada não aparece nos resultados desta consulta.");
          }
        }
        if (result.page !== page) {
          // Page and results commit together: no flash of the prior page.
          skipOnePageFetchRef.current = result.page;
          setPage(result.page);
        }
        if (retryInPlace && document.activeElement === retryButtonRef.current) {
          focusResultsAfterRetry.current = true;
        }
        setOrders(result.orders);
        setTotal(result.total);
        setListUpdatedAt(new Date());
        setError("");
      })
      .catch(() => {
        if (requestId !== listRequestId.current) return;
        returnOrderIdRef.current = null;
        pendingAnchorFocusRef.current = null;
        setHighlightOrderId(null);
        setReturnNotice("");
        focusResultsAfterRetry.current = false;
        setOrders([]);
        setTotal(null);
        setListUpdatedAt(null);
        setError("Não foi possível carregar as Ordens de Serviço.");
      })
      .finally(() => {
        if (requestId === listRequestId.current) setLoading(false);
      });
  };
  useEffect(() => {
    if (skipOnePageFetchRef.current === page) {
      skipOnePageFetchRef.current = null;
      return;
    }
    // While search input is being edited, do not fetch the old query even
    // if another filter changes; the most recent search intent wins.
    if (searchEditVersion !== searchCommittedVersion) return;
    load();
    return () => {
      listRequestId.current += 1;
    };
  }, [
    page, query, artStatus, prodStatus, priority, logistics, quick,
    searchEditVersion, searchCommittedVersion, listRefreshKey,
  ]);
  useEffect(() => {
    if (loading || error || total === null || !pendingAnchorFocusRef.current) return;
    const targetId = pendingAnchorFocusRef.current;
    pendingAnchorFocusRef.current = null;
    const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-central-order-id]"));
    const target = matches.find(el =>
      el.dataset.centralOrderId === targetId && el.getClientRects().length > 0
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [loading, error, total, highlightOrderId, orders]);

  useEffect(() => {
    if (!loading && !error && total !== null && focusResultsAfterRetry.current) {
      focusResultsAfterRetry.current = false;
      resultsHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [loading, error, total]);
  const refreshSummary = useCallback(() => {
    const requestId = ++summaryRequestId.current;
    setSummaryStatus("loading");
    setSummaryUpdatedAt(null);
    setSummaryTotal(null);
    setSummaryOrders([]);
    void listOperationalOrderSummaryRows()
      .then(result => {
        if (requestId !== summaryRequestId.current) return;
        setSummaryOrders(result.orders);
        setSummaryTotal(result.total);
        setSummaryUpdatedAt(new Date());
        setSummaryStatus("ready");
      })
      .catch(() => {
        if (requestId !== summaryRequestId.current) return;
        setSummaryOrders([]);
        setSummaryTotal(null);
        setSummaryUpdatedAt(null);
        setSummaryStatus("error");
      });
  }, []);
  useEffect(() => {
    refreshSummary();
    return () => {
      summaryRequestId.current += 1;
    };
  }, [refreshSummary]);
  useEffect(() => {
    if (searchEditVersion === searchCommittedVersion) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search);
      setSearchCommittedVersion(searchEditVersion);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchEditVersion, searchCommittedVersion]);
  const summary = useMemo(
    () => summaryTotal === null ? null : summarizeOrders(summaryOrders, summaryTotal),
    [summaryOrders, summaryTotal]
  );
  const pages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
  const refreshAll = () => {
    if (loading || summaryStatus === "loading" ||
        searchEditVersion !== searchCommittedVersion) return;
    invalidateList();
    refreshSummary();
    setListRefreshKey(value => value + 1);
  };
  const retryList = () => {
    if (loading || !error) return;
    load(true);
  };

  const rememberOpenedOrder = (orderId: string) => {
    if (!user?.id || !hubPermissions.canViewHubOS) return;
    saveCentralReturn(centralSessionStorage(), {
      userId: user.id, orderId, page, search: query, quick,
      artStatus, prodStatus, priority, logistics,
    }, Date.now());
  };

  const selectFilters = (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select value={draftArtStatus} onValueChange={setDraftArtStatus}>
        <SelectTrigger aria-label="Filtrar etapa de arte">
          <SelectValue placeholder="Etapa de arte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Etapa de arte</SelectItem>
          {ART_COLUMNS.map(value => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={draftProdStatus} onValueChange={setDraftProdStatus}>
        <SelectTrigger aria-label="Filtrar etapa de produção">
          <SelectValue placeholder="Etapa de produção" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Etapa de produção</SelectItem>
          {PROD_COLUMNS.map(value => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={draftPriority} onValueChange={setDraftPriority}>
        <SelectTrigger aria-label="Filtrar prioridade">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Prioridade</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="urgent">Urgente</SelectItem>
        </SelectContent>
      </Select>
      <Select value={draftLogistics} onValueChange={setDraftLogistics}>
        <SelectTrigger aria-label="Filtrar logística">
          <SelectValue placeholder="Logística" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Logística</SelectItem>
          <SelectItem value="retirada">Retirada</SelectItem>
          <SelectItem value="entrega">Entrega</SelectItem>
          <SelectItem value="instalacao">Instalação</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
  const filterPanel = (
    <div className="space-y-4">
      <section className="space-y-2" aria-label="Situação">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Situação
        </p>
        <div className="flex flex-wrap gap-2">
          {quickFilters.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              className="rounded-full"
              aria-pressed={draftQuick === value}
              variant={draftQuick === value ? "default" : "outline"}
              onClick={() => setDraftQuick(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Outros recortes operacionais
        </p>
        <Select
          value={isExtraQuickFilter(draftQuick) ? draftQuick : "none"}
          onValueChange={value =>
            setDraftQuick(value === "none" ? "all" : (value as QuickOrderFilter))
          }
        >
          <SelectTrigger aria-label="Outros recortes operacionais">
            <SelectValue placeholder="Nenhum recorte adicional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum recorte adicional</SelectItem>
            {extraQuickFilters.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Etapas e classificação
        </p>
        {selectFilters}
      </section>
      {hasDraftChanges && (
        <p role="status" className="text-xs text-muted-foreground">
          Alterações não aplicadas
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" onClick={clearDraftFilters}>
          <RotateCcw className="h-4 w-4" />
          Limpar
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={applyDraftFilters}>Aplicar filtros</Button>
        </div>
      </div>
    </div>
  );
  const activeChips = [
    isExtraQuickFilter(quick)
      ? {
          key: "quick",
          label: extraQuickFilters.find(([value]) => value === quick)?.[1],
          clear: () => setQuick("all"),
        }
      : null,
    artStatus !== "all"
      ? {
          key: "art",
          label: `Arte: ${artStatus}`,
          clear: () => setArtStatus("all"),
        }
      : null,
    prodStatus !== "all"
      ? {
          key: "prod",
          label: `Produção: ${prodStatus}`,
          clear: () => setProdStatus("all"),
        }
      : null,
    priority !== "all"
      ? {
          key: "priority",
          label: `Prioridade: ${priority === "urgent" ? "Urgente" : "Normal"}`,
          clear: () => setPriority("all"),
        }
      : null,
    logistics !== "all"
      ? {
          key: "logistics",
          label: `Logística: ${logistics === "instalacao" ? "Instalação" : logistics === "entrega" ? "Entrega" : "Retirada"}`,
          clear: () => setLogistics("all"),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label?: string;
    clear: () => void;
  }>;

  return (
    <main className="evolu-orders space-y-4 pb-10">
      <div className="evolu-orders__heading flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="evolu-orders__eyebrow">Gestão operacional <span aria-hidden="true" /></p>
        <PageHeader
          title="Ordens de Serviço"
          description={total === null
            ? "Consulta de ordens ainda não confirmada"
            : `${total} ${total === 1 ? "ordem encontrada" : "ordens encontradas"} · Acompanhamento operacional centralizado`}
        />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-disabled={loading || summaryStatus === "loading"}
            onClick={refreshAll}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </Button>
          {hubPermissions.canCreateOs && (
            <Button className="evolu-orders__new-button evolu-ui-primary-action" onClick={() => setLocation(createOrderPath("/os"))}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Nova OS
            </Button>
          )}
        </div>
      </div>
      <OrdersSummaryCards
        summary={summary}
        loading={summaryStatus === "loading"}
        error={summaryStatus === "error"}
        onRetry={refreshSummary}
        selectedUrgent={quick === "urgent"}
        onSelectUrgent={() => {
          if (quick !== "urgent" || page !== 1) {
            invalidateList();
            setQuick("urgent");
            setPage(1);
          }
        }}
      />
      {summaryUpdatedAt && summaryStatus === "ready" && (
        <p className="text-xs text-muted-foreground">
          Indicadores atualizados às {summaryUpdatedAt.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}
        </p>
      )}
      <>
          <section aria-label="Filtros rápidos" className="evolu-orders__quick-filters evolu-ui-panel">
            <div className="evolu-orders__quick-label">
              <span>Visualização rápida</span>
              <span className="evolu-orders__quick-hint">Filtre as ordens com um toque</span>
            </div>
            <div className="evolu-orders__quick-scroll">
              {quickFilters.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  className="evolu-orders__quick-button evolu-ui-filter-control"
                  variant={quick === value ? "default" : "outline"}
                  aria-pressed={quick === value}
                  onClick={() => {
                    if (value !== quick || page !== 1) {
                      invalidateList();
                      setQuick(value);
                      setPage(1);
                    }
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </section>
          <Card className="evolu-orders__filter-card evolu-ui-panel gap-4 py-4 shadow-xs">
            <CardContent className="space-y-3 px-4">
              <div className="evolu-orders__toolbar flex gap-2">
                <OrderSearch value={search} onChange={handleSearchChange} />
                {isMobile ? (
                  <Sheet open={filtersOpen} onOpenChange={handleFiltersOpenChange}>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="evolu-orders__advanced-button">
                        <Filter className="h-4 w-4" />
                        Filtros
                        {advancedCount > 0 && (
                          <Badge className="ml-1 h-5 min-w-5 px-1.5">{advancedCount}</Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-6">
                      <SheetHeader>
                        <SheetTitle>Filtros da Central</SheetTitle>
                      </SheetHeader>
                      <div className="px-4">{filterPanel}</div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Popover open={filtersOpen} onOpenChange={handleFiltersOpenChange}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="evolu-orders__advanced-button">
                        <Filter className="h-4 w-4" />
                        Filtros
                        {advancedCount > 0 && (
                          <Badge className="ml-1 h-5 min-w-5 px-1.5">{advancedCount}</Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[min(32rem,calc(100vw-2rem))] max-h-[80dvh] space-y-4 overflow-y-auto">
                      <h2 className="font-semibold">Filtros</h2>
                      {filterPanel}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              {activeChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {activeChips.map(chip => (
                    <Button
                      key={chip.key}
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        invalidateList();
                        chip.clear();
                        setPage(1);
                      }}
                    >
                      {chip.label}
                      <X className="h-3 w-3" />
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          {returnNotice && (
            <div role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
              {returnNotice}
            </div>
          )}
          <p role="status" className="sr-only">
            {!loading && !error && highlightOrderId ? "Ordem anteriormente aberta localizada nos resultados." : ""}
          </p>
          <p role="status" className="sr-only">
            {!loading && !error && total !== null
              ? total === 0
                ? "Consulta concluída. Nenhuma OS encontrada."
                : `Consulta concluída. ${total} ${total === 1 ? "ordem encontrada" : "ordens encontradas"}.`
              : ""}
          </p>
          {error ? (
            <OrdersListRecovery
              retrying={loading}
              onRetry={retryList}
              retryRef={retryButtonRef}
            />
          ) : loading || total === null ? (
            <OrdersLoading />
          ) : (
            <div className="evolu-orders__table evolu-ui-panel">
              <div className="evolu-orders__table-heading">
                <div>
                  {quick === "urgent" && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Exibindo: Urgentes</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          invalidateList();
                          setQuick("all");
                          setPage(1);
                        }}
                      >
                        Voltar a Todas
                      </Button>
                    </div>
                  )}
                  <h2 ref={resultsHeadingRef} tabIndex={-1}>Relação de ordens</h2>
                  <p>{total} {total === 1 ? "registro encontrado" : "registros encontrados"} nesta consulta</p>
                </div>
                <span className="evolu-orders__live-hint">
                  {listUpdatedAt
                    ? `Lista atualizada às ${listUpdatedAt.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"})}`
                    : "Lista atualizada"}
                </span>
              </div>
              <OrderTable
                orders={orders}
                onClearFilters={hasFilters ? clearFilters : undefined}
                onOpenOrder={rememberOpenedOrder}
                highlightOrderId={highlightOrderId}
              />
            </div>
          )}
          {!loading && !error && total !== null && (
          <footer className="evolu-orders__footer flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Mostrando {orders.length} de {total} {total === 1 ? "ordem" : "ordens"}
            </span>
            {pages > 1 && (
              <nav aria-label="Paginação das ordens" className="flex flex-wrap items-center gap-2">
                <span className="sr-only sm:not-sr-only" aria-current="page">
                  Página {page} de {pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Página anterior"
                  className="min-h-11 sm:min-h-8"
                  disabled={page === 1 || loading}
                  onClick={() => {
                    invalidateList();
                    setPage(value => value - 1);
                  }}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Próxima página"
                  className="min-h-11 sm:min-h-8"
                  disabled={page >= pages || loading}
                  onClick={() => {
                    invalidateList();
                    setPage(value => value + 1);
                  }}
                >
                  Próxima
                </Button>
              </nav>
            )}
          </footer>
          )}
        </>
    </main>
  );
}
