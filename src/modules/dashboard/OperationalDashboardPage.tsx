import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OsOrder } from "@/features/hubos/types";
import {
  getOperationalDashboardMetrics,
  listOperationalAttentionOrders,
  type DashboardPeriod,
  type OperationalDashboardMetrics,
} from "@/modules/orders/orderRepository";
import { calculateOrderRisk } from "@/modules/orders/risk";
import { addLocalDays, formatLocalDate } from "@/shared/lib/date";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/shared/components/OperationalUi";

type Period = "today" | "week" | "month" | "all" | "custom";

function periodRange(
  period: Period,
  start: string,
  end: string
): DashboardPeriod {
  const now = new Date();
  const today = formatLocalDate(now);
  if (period === "all") return {};
  if (period === "custom")
    return { start: start || undefined, end: end || undefined };
  if (period === "today") return { start: today, end: today };
  if (period === "week")
    return { start: today, end: formatLocalDate(addLocalDays(now, 7)) };
  const [year, month] = today.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0, 15));
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: formatLocalDate(monthEnd),
  };
}

export default function OperationalDashboardPage() {
  const [metrics, setMetrics] = useState<OperationalDashboardMetrics | null>(
    null
  );
  const [attention, setAttention] = useState<OsOrder[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(
    () => periodRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );
  const invalidRange = Boolean(
    range.start && range.end && range.start > range.end
  );
  const load = useCallback(() => {
    if (invalidRange) return;
    setLoading(true);
    setError("");
    Promise.all([
      getOperationalDashboardMetrics(range),
      listOperationalAttentionOrders(8),
    ])
      .then(([nextMetrics, nextAttention]) => {
        setMetrics(nextMetrics);
        setAttention(nextAttention);
      })
      .catch(reason =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao carregar o dashboard."
        )
      )
      .finally(() => setLoading(false));
  }, [invalidRange, range]);
  useEffect(load, [load]);

  const workload = metrics
    ? ([
        ["Arte", metrics.art],
        ["Produção", metrics.production],
        ["Acabamento", metrics.finish],
        ["Letra Caixa", metrics.letterBox],
        ["Produção externa", metrics.externalProduction],
        ["Instalação", metrics.installationLoad],
      ] as const)
    : [];
  const maxLoad = Math.max(1, ...workload.map(([, value]) => value));

  return (
    <div className="pb-10">
      <PageHeader
        title="Dashboard operacional"
        description="Estado atual da operação e prazos do período selecionado."
        actions={
          <Button asChild>
            <Link href="/os">
              Ver todas as OS <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["today", "Hoje"],
            ["week", "Esta semana"],
            ["month", "Este mês"],
            ["all", "Todo o período"],
            ["custom", "Personalizado"],
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
      {period === "custom" && (
        <div className="mb-5 grid max-w-lg gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Data inicial
            <Input
              className="mt-1"
              type="date"
              value={customStart}
              onChange={event => setCustomStart(event.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Data final
            <Input
              className="mt-1"
              type="date"
              value={customEnd}
              onChange={event => setCustomEnd(event.target.value)}
            />
          </label>
          {invalidRange && (
            <p className="text-sm text-destructive sm:col-span-2">
              A data final deve ser igual ou posterior à inicial.
            </p>
          )}
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : (
        metrics && (
          <>
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
              <StatCard
                label="Instalações no período"
                value={metrics.installations}
              />
              <StatCard
                label="Atrasadas no período"
                value={metrics.overdue}
                tone="danger"
              />
              <StatCard
                label="Prazo hoje"
                value={metrics.today}
                tone="danger"
              />
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
                      Nenhuma situação crítica.
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
                            {order.title ||
                              order.prod_status ||
                              order.art_status}
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
              Estoque operacional considera todas as OS acessíveis. Instalações
              e atrasos respeitam o período e usam a data de entrega enquanto
              não existe uma data de instalação dedicada.
            </p>
          </>
        )
      )}
    </div>
  );
}
