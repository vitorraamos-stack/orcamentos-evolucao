import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ART_COLUMNS, PROD_COLUMNS } from "@/features/hubos/constants";
import type { OsOrder } from "@/features/hubos/types";
import { listOperationalOrders } from "../orderRepository";
import { matchesQuickFilter, type QuickOrderFilter } from "../orderFilters";
import { OrderSearch } from "../components/OrderSearch";
import { OrderTable } from "../components/OrderTable";
import {
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/shared/components/OperationalUi";

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

export default function OrdersCentralPage() {
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickOrderFilter>("all");
  const [artStatus, setArtStatus] = useState("all");
  const [prodStatus, setProdStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    setError("");
    listOperationalOrders({
      page,
      pageSize: 25,
      search: query,
      artStatus: artStatus === "all" ? undefined : artStatus,
      prodStatus: prodStatus === "all" ? undefined : prodStatus,
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
  useEffect(load, [page, query, artStatus, prodStatus]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(search);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  const visible = useMemo(
    () => orders.filter(order => matchesQuickFilter(order, quick)),
    [orders, quick]
  );
  return (
    <div className="pb-10">
      <PageHeader
        title="Ordens de Serviço"
        description={`${total} ordens encontradas · acompanhamento operacional centralizado`}
      />
      <div className="mb-4 flex flex-col gap-3">
        <OrderSearch value={search} onChange={setSearch} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickFilters.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={quick === value ? "default" : "outline"}
              onClick={() => setQuick(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-2/3">
          <Select
            value={artStatus}
            onValueChange={value => {
              setPage(1);
              setArtStatus(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Etapa de arte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas de arte</SelectItem>
              {ART_COLUMNS.map(value => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={prodStatus}
            onValueChange={value => {
              setPage(1);
              setProdStatus(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Etapa de produção" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas de produção</SelectItem>
              {PROD_COLUMNS.map(value => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : (
        <OrderTable orders={visible} />
      )}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / 25))}
        </span>
        <div className="flex gap-2">
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
            disabled={page * 25 >= total}
            onClick={() => setPage(value => value + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
