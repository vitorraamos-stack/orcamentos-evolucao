import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OsOrder } from "@/features/hubos/types";
import { listDashboardOrders } from "@/modules/orders/orderRepository";
import { calculateOrderRisk, isOrderFinished } from "@/modules/orders/risk";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/shared/components/OperationalUi";

type Period = "today" | "week" | "month" | "all";
const iso = (date: Date) => date.toISOString().slice(0, 10);
const statusIncludes = (order: OsOrder, term: string) =>
  `${order.art_status} ${order.prod_status ?? ""}`
    .toLocaleLowerCase("pt-BR")
    .includes(term);

export default function OperationalDashboardPage() {
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    setError("");
    listDashboardOrders()
      .then(setOrders)
      .catch(reason =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar o dashboard."
        )
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const today = useMemo(() => new Date(), []);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const filtered = useMemo(() => {
    if (period === "all") return orders;
    const start = iso(today);
    const end = new Date(today);
    end.setDate(
      today.getDate() + (period === "today" ? 0 : period === "week" ? 7 : 30)
    );
    return orders.filter(
      order =>
        !order.delivery_date ||
        (order.delivery_date >= start && order.delivery_date <= iso(end))
    );
  }, [orders, period, today]);
  const metrics = useMemo(
    () => ({
      active: filtered.filter(o => !isOrderFinished(o)).length,
      art: filtered.filter(o => !o.prod_status && !isOrderFinished(o)).length,
      approval: filtered.filter(o => statusIncludes(o, "aprovação")).length,
      production: filtered.filter(o => statusIncludes(o, "produção")).length,
      finish: filtered.filter(o => statusIncludes(o, "acabamento")).length,
      ready: filtered.filter(o => statusIncludes(o, "pronto")).length,
      installations: filtered.filter(
        o => o.logistic_type === "instalacao" && !isOrderFinished(o)
      ).length,
      overdue: filtered.filter(
        o =>
          calculateOrderRisk(o) === "CRITICO" &&
          Boolean(o.delivery_date && o.delivery_date < iso(today))
      ).length,
      today: filtered.filter(o => o.delivery_date === iso(today)).length,
      tomorrow: filtered.filter(o => o.delivery_date === iso(tomorrow)).length,
    }),
    [filtered, today]
  );
  const attention = useMemo(
    () =>
      filtered
        .filter(
          o =>
            calculateOrderRisk(o) !== "NORMAL" ||
            (!o.created_by && !isOrderFinished(o))
        )
        .slice(0, 8),
    [filtered]
  );
  const workload = [
    ["Arte", metrics.art],
    ["Produção", metrics.production],
    ["Acabamento", metrics.finish],
    ["Letra Caixa", filtered.filter(o => o.letra_caixa).length],
    [
      "Produção externa",
      filtered.filter(o => o.production_tag === "PRODUCAO_EXTERNA").length,
    ],
    ["Instalação", metrics.installations],
  ] as const;
  const maxLoad = Math.max(1, ...workload.map(([, value]) => value));
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={load} />;
  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard operacional"
        description="Visão em tempo real da operação do Hub OS."
        actions={
          <Button asChild>
            <Link href="/os">
              Ver todas as OS <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {(
          [
            ["today", "Hoje"],
            ["week", "Esta semana"],
            ["month", "Este mês"],
            ["all", "Todo o período"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={period === value ? "default" : "outline"}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="OS ativas" value={metrics.active} />
        <StatCard label="Em Arte" value={metrics.art} />
        <StatCard
          label="Aguardando aprovação"
          value={metrics.approval}
          tone="warning"
        />
        <StatCard label="Em Produção" value={metrics.production} />
        <StatCard label="Em Acabamento" value={metrics.finish} />
        <StatCard
          label="Material pronto"
          value={metrics.ready}
          tone="success"
        />
        <StatCard label="Instalações agendadas" value={metrics.installations} />
        <StatCard label="Atrasadas" value={metrics.overdue} tone="danger" />
        <StatCard label="Prazo hoje" value={metrics.today} tone="danger" />
        <StatCard
          label="Prazo amanhã"
          value={metrics.tomorrow}
          tone="warning"
        />
      </section>
      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma situação crítica no período.
              </p>
            ) : (
              attention.map(order => (
                <Link
                  key={order.id}
                  href={`/os/${order.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      #{order.sale_number} · {order.client_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.title || order.prod_status || order.art_status}
                    </p>
                  </div>
                  <OrderRiskBadge risk={calculateOrderRisk(order)} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Carga operacional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workload.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(value / maxLoad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        A visão operacional considera as 200 OS ativas atualizadas mais
        recentemente. A Central de OS oferece consulta paginada completa.
      </p>
    </div>
  );
}
