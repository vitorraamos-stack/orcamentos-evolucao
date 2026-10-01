import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Filter, RotateCcw, X } from "lucide-react";
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
import {
  listOperationalOrders,
  listOperationalOrderSummaryRows,
} from "../orderRepository";
import type { QuickOrderFilter } from "../orderFilters";
import { OrderSearch } from "../components/OrderSearch";
import { OrderTable } from "../components/OrderTable";
import { OrdersSummaryCards } from "../components/OrdersSummaryCards";
import { summarizeOrders } from "../orderSummary";
import { ErrorState, PageHeader } from "@/shared/components/OperationalUi";

const PAGE_SIZE = 25;
const quickFilters: Array<[QuickOrderFilter, string]> = [
  ["all", "Todas"],
  ["active", "Em andamento"],
  ["today", "Hoje"],
  ["tomorrow", "Amanhã"],
  ["week", "Esta semana"],
  ["overdue", "Atrasadas"],
  ["urgent", "Urgentes"],
  ["pending", "Pendentes"],
  ["finished", "Finalizadas"],
];

function OrdersLoading() {
  return (
    <div aria-label="Carregando ordens" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <div className="space-y-2 rounded-xl border p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function OrdersCentralPage() {
  const { hubPermissions } = useAuth();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [summaryOrders, setSummaryOrders] = useState<OsOrder[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickOrderFilter>("all");
  const [artStatus, setArtStatus] = useState("all");
  const [prodStatus, setProdStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [logistics, setLogistics] = useState("all");
  const [draftQuick, setDraftQuick] = useState<QuickOrderFilter>("all");
  const [draftArtStatus, setDraftArtStatus] = useState("all");
  const [draftProdStatus, setDraftProdStatus] = useState("all");
  const [draftPriority, setDraftPriority] = useState("all");
  const [draftLogistics, setDraftLogistics] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const advancedCount = [
    quick,
    artStatus,
    prodStatus,
    priority,
    logistics,
  ].filter(value => value !== "all").length;
  const hasFilters = Boolean(search || quick !== "all" || advancedCount);

  const clearFilters = () => {
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
    setQuick(draftQuick);
    setArtStatus(draftArtStatus);
    setProdStatus(draftProdStatus);
    setPriority(draftPriority);
    setLogistics(draftLogistics);
    setPage(1);
    setFiltersOpen(false);
  };
  const load = () => {
    setLoading(true);
    setError("");
    listOperationalOrders({
      page,
      pageSize: PAGE_SIZE,
      search: query,
      artStatus: artStatus === "all" ? undefined : artStatus,
      prodStatus: prodStatus === "all" ? undefined : prodStatus,
      urgent: priority === "all" ? undefined : priority === "urgent",
      logisticType:
        logistics === "all" ? undefined : (logistics as LogisticType),
      quickFilter: quick,
    })
      .then(result => {
        setOrders(result.orders);
        setTotal(result.total);
      })
      .catch(reason =>
        setError(
          reason instanceof Error ? reason.message : "Falha ao carregar as OS."
        )
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, [
    page,
    query,
    artStatus,
    prodStatus,
    priority,
    logistics,
    quick,
  ]);
  useEffect(() => {
    listOperationalOrderSummaryRows()
      .then(result => {
        setSummaryOrders(result.orders);
        setSummaryTotal(result.total);
      })
      .catch(() => {
        // The central stays usable if this optional snapshot cannot be loaded.
      });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const summary = useMemo(
    () =>
      summarizeOrders(
        summaryOrders.length ? summaryOrders : orders,
        summaryOrders.length ? summaryTotal : total
      ),
    [orders, summaryOrders, summaryTotal, total]
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const selectFilters = (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select value={draftArtStatus} onValueChange={setDraftArtStatus}>
        <SelectTrigger>
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
        <SelectTrigger>
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
        <SelectTrigger>
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Prioridade</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="urgent">Urgente</SelectItem>
        </SelectContent>
      </Select>
      <Select value={draftLogistics} onValueChange={setDraftLogistics}>
        <SelectTrigger>
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
  const activeChips = [
    quick !== "all"
      ? {
          key: "quick",
          label: quickFilters.find(([value]) => value === quick)?.[1],
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
    <main className="space-y-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Ordens de Serviço"
          description={`${total} ordens encontradas · Acompanhamento operacional centralizado`}
        />
        {hubPermissions.canCreateOs && (
          <Button onClick={() => setLocation(createOrderPath("/os"))}>
            + Nova OS
          </Button>
        )}
      </div>
      {loading && !orders.length ? (
        <OrdersLoading />
      ) : (
        <>
          <OrdersSummaryCards summary={summary} />
          <Card className="gap-4 py-4 shadow-xs">
            <CardContent className="space-y-3 px-4">
              <div className="flex gap-2">
                <OrderSearch value={search} onChange={setSearch} />
                <Popover
                  open={filtersOpen}
                  onOpenChange={handleFiltersOpenChange}
                >
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <Filter className="h-4 w-4" />
                      Filtros
                      {advancedCount > 0 && (
                        <Badge className="ml-1 h-5 min-w-5 px-1.5">
                          {advancedCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-[min(32rem,calc(100vw-2rem))] space-y-4"
                  >
                    <h2 className="font-semibold">Filtros</h2>
                    <section className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Situação
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {quickFilters.map(([value, label]) => (
                          <Button
                            key={value}
                            size="sm"
                            className="rounded-full"
                            variant={
                              draftQuick === value ? "default" : "outline"
                            }
                            onClick={() => setDraftQuick(value)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </section>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Etapas e classificação
                    </p>
                    {selectFilters}
                    <div className="flex justify-between border-t pt-3">
                      <Button variant="ghost" onClick={clearDraftFilters}>
                        <RotateCcw className="h-4 w-4" />
                        Limpar
                      </Button>
                      <Button onClick={applyDraftFilters}>
                        Aplicar filtros
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
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
          {error ? (
            <Card>
              <CardContent>
                <ErrorState
                  message="Não foi possível carregar as Ordens de Serviço."
                  retry={load}
                />
              </CardContent>
            </Card>
          ) : (
            <OrderTable
              orders={orders}
              onClearFilters={hasFilters ? clearFilters : undefined}
            />
          )}
          <footer className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {orders.length} de {total} ordens
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">
                  Página {page} de {pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(value => value - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage(value => value + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
