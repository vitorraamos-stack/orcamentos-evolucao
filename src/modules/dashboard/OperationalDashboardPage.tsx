import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, ArrowRight, CalendarClock, ClipboardList,
  Factory, Layers3, Palette, RefreshCw, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorState, PageHeader } from "@/shared/components/OperationalUi";
import { buildDashboardOverview, type DashboardOverview, type DashboardOrder } from "./dashboardModel";
import { listDashboardAssignees, listDashboardOrders, type DashboardAssignee } from "./dashboardRepository";
import { DashboardAgendaPanel } from "./DashboardAgendaPanel";
import { buildDashboardAgenda, type DashboardAgenda } from "./dashboardAgenda";
import { listDashboardAgendaSources } from "./dashboardAgendaRepository";
import "./operational-dashboard.css";

const REFRESH_INTERVAL = 120_000;
type Snapshot = { userId: string; overview: DashboardOverview; updatedAt: Date };
type Assignments = { userId: string; rows: DashboardAssignee[] };
type AgendaSnapshot = { userId: string; accessKey: string; agenda: DashboardAgenda; updatedAt: Date };

function dateLabel(date: string | null) {
  if (!date) return "Não informado";
  const [year, month, day] = date.split("-");
  return year && month && day ? day + "/" + month + "/" + year : "Não informado";
}

function scopeForOrder(order: DashboardOrder) {
  if (order.prod_status === "Instalação Agendada" || order.prod_status === "Logística (Entrega/Transportadora)") return "INSTALLATION";
  if (order.prod_status === "Em Acabamento") return "FINISHING";
  if (order.prod_status === "Produção" || order.prod_status === "Pronto / Avisar Cliente") return "PRODUCTION";
  return "ART";
}

function responsibleLabel(order: DashboardOrder, assignments: DashboardAssignee[] | null) {
  if (!assignments) return "Consultando…";
  const people = assignments.filter(row => row.order_id === order.id);
  const preferred = people.find(row => row.scope === scopeForOrder(order) && row.email);
  const general = people.find(row => row.scope === "GENERAL" && row.email);
  const any = people.find(row => row.email);
  return (preferred ?? general ?? any)?.email ?? "Não informado";
}

function SummaryIndicators({ overview }: { overview: DashboardOverview | null }) {
  const values = [
    { label: "OS ativas", value: overview?.active, href: "/os?quick=active", icon: ClipboardList, tone: "primary" },
    { label: "Exigem atenção", value: overview?.attention, href: "/os", icon: AlertTriangle, tone: "warning" },
    { label: "Atrasadas", value: overview?.overdue, href: "/os?quick=overdue", icon: CalendarClock, tone: "danger" },
    { label: "Vencem hoje", value: overview?.dueToday, href: "/os?quick=today", icon: CalendarClock, tone: "primary" },
  ] as const;
  return (
    <section className="evolu-dashboard__indicators" aria-label="Indicadores operacionais">
      {values.map(({ label, value, href, icon: Icon, tone }) => (
        <Link
          key={label} href={href}
          className={"evolu-dashboard__indicator evolu-dashboard__indicator--" + tone}
          aria-label={label + ": " + (value === undefined ? "carregando" : value) + " OS. Abrir Central de OS"}
        >
          <span className="evolu-dashboard__indicator-label"><Icon aria-hidden="true" className="h-5 w-5" /> {label}</span>
          <span className="evolu-dashboard__indicator-value" aria-busy={value === undefined}>
            {value === undefined ? "—" : value}
          </span>
          <span className="evolu-dashboard__indicator-hint">Consultar OS <ArrowRight aria-hidden="true" className="h-4 w-4" /></span>
        </Link>
      ))}
    </section>
  );
}

function PriorityOrders({
  overview, assignments,
}: { overview: DashboardOverview | null; assignments: DashboardAssignee[] | null }) {
  return (
    <section aria-labelledby="dashboard-priority-heading" className="min-w-0">
      <Card className="evolu-dashboard__panel h-full">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle id="dashboard-priority-heading" className="text-base">OS prioritárias</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Cinco ordens selecionadas por prazo, bloqueios e urgência.</p>
          </div>
          <Link href="/os" className="evolu-dashboard__text-link shrink-0">Todas as OS <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview === null ? (
            <div className="space-y-3" role="status" aria-label="Carregando prioridades">
              {[1, 2, 3].map(item => <div key={item} className="evolu-dashboard__skeleton h-20" />)}
            </div>
          ) : overview.priorities.length === 0 ? (
            <p className="evolu-dashboard__empty">Nenhuma OS ativa para priorizar.</p>
          ) : overview.priorities.map(({ order, reason, stage }) => (
            <Link
              key={order.id}
              href={"/os/" + encodeURIComponent(order.id)}
              className="evolu-dashboard__priority"
              aria-label={"Abrir OS " + (order.sale_number?.trim() || "sem número") + ", " + order.client_name}
            >
              <div className="evolu-dashboard__priority-top">
                <div className="min-w-0">
                  <p className="evolu-dashboard__priority-title">
                    {order.sale_number?.trim() ? "OS " + order.sale_number : "Número não informado"}
                    <span className="mx-2 text-muted-foreground" aria-hidden="true">·</span>
                    {order.client_name?.trim() || "Cliente não informado"}
                  </p>
                  <p className="evolu-dashboard__priority-service">{order.title?.trim() || "Serviço não informado"}</p>
                </div>
                <span className="evolu-dashboard__priority-reason">{reason}</span>
              </div>
              <div className="evolu-dashboard__priority-details">
                <span><strong>Etapa:</strong> {stage}</span>
                <span><strong>Responsável:</strong> {responsibleLabel(order, assignments)}</span>
                <span><strong>Prazo:</strong> {dateLabel(order.delivery_date)}</span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function SectorFlow({ overview }: { overview: DashboardOverview | null }) {
  const { hubPermissions } = useAuth();
  const sectors = [
    { label: "Arte e aprovação", value: overview?.sectors.artwork, icon: Palette, href: "/os/arte", allowed: hubPermissions.canViewArteBoard },
    { label: "Produção", value: overview?.sectors.production, icon: Factory, href: "/os/producao", allowed: hubPermissions.canViewProducaoBoard },
    { label: "Finalização", value: overview?.sectors.finishing, icon: Layers3, href: "/os/producao/acabamento", allowed: hubPermissions.canViewProducaoBoard },
    { label: "Logística", value: overview?.sectors.logistics, icon: Truck, href: hubPermissions.canViewInstallations ? "/instalacoes" : "/entregas", allowed: hubPermissions.canViewInstallations || hubPermissions.canViewDeliveries },
  ] as const;
  return (
    <section aria-labelledby="dashboard-flow-heading" className="mt-5">
      <Card className="evolu-dashboard__panel">
        <CardHeader>
          <CardTitle id="dashboard-flow-heading" className="text-base">Fluxo por setores</CardTitle>
          <p className="text-sm text-muted-foreground">Situação operacional registrada. Uma OS pode participar de mais de um setor quando há trabalho paralelo.</p>
        </CardHeader>
        <CardContent>
          <div className="evolu-dashboard__sectors">
            {sectors.map(({ label, value, icon: Icon, href, allowed }) => {
              const child = (
                <>
                  <div className="flex items-center gap-2"><Icon aria-hidden="true" className="h-5 w-5 text-primary" /><span className="font-medium">{label}</span></div>
                  <div className="flex items-end justify-between gap-3">
                    <strong className="text-3xl tabular-nums" aria-busy={value === undefined}>{value === undefined ? "—" : value}</strong>
                    {allowed && <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </>
              );
              return allowed
                ? <Link key={label} href={href} className="evolu-dashboard__sector evolu-dashboard__sector--link" aria-label={"Abrir " + label}>{child}</Link>
                : <div key={label} className="evolu-dashboard__sector">{child}</div>;
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function OperationalDashboardSections({
  overview, assignments, agenda, agendaError,
}: {
  overview: DashboardOverview | null;
  assignments?: DashboardAssignee[] | null;
  agenda?: DashboardAgenda | null;
  agendaError?: string;
}) {
  return (
    <>
      <SummaryIndicators overview={overview} />
      <div className="evolu-dashboard__main mt-5">
        <PriorityOrders overview={overview} assignments={assignments ?? null} />
        <DashboardAgendaPanel agenda={agenda ?? null} error={agendaError} />
      </div>
      <SectorFlow overview={overview} />
    </>
  );
}

export default function OperationalDashboardPage() {
  const { user, hasModuleAccess, hubPermissions } = useAuth();
  const userId = user?.id ?? null;
  const authorized = Boolean(userId && hubPermissions.canViewHubOS && hasModuleAccess("hub_os"));
  const accessKey = [
    hubPermissions.isManager ? "manager" : "member",
    hubPermissions.canViewInstallations ? "installation" : "no-installation",
    hubPermissions.canViewDeliveries ? "delivery" : "no-delivery",
  ].join(":");
  const [stored, setStored] = useState<Snapshot | null>(null);
  const [storedAssignments, setStoredAssignments] = useState<Assignments | null>(null);
  const [storedAgenda, setStoredAgenda] = useState<AgendaSnapshot | null>(null);
  const [agendaError, setAgendaError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastSuccessRef = useRef(0);
  const snapshot = authorized && stored?.userId === userId ? stored : null;
  const assignments = authorized && storedAssignments?.userId === userId
    ? storedAssignments.rows : null;
  const agenda = authorized && storedAgenda?.userId === userId && storedAgenda.accessKey === accessKey
    ? storedAgenda.agenda : null;

  const refresh = useCallback(async () => {
    if (!authorized || !userId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    setError("");
    setAgendaError("");
    try {
      const now = new Date();
      const rows = await listDashboardOrders(controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const overview = buildDashboardOverview(rows, now);
      setStored({ userId, overview, updatedAt: new Date() });
      setStoredAssignments(null);
      setStoredAgenda(null);
      lastSuccessRef.current = Date.now();
      setRefreshing(false);
      void listDashboardAssignees(overview.priorities.map(item => item.order.id), controller.signal)
        .then(people => {
          if (!controller.signal.aborted && requestId === requestIdRef.current)
            setStoredAssignments({ userId, rows: people });
        })
        .catch(() => {
          if (!controller.signal.aborted && requestId === requestIdRef.current)
            setStoredAssignments({ userId, rows: [] });
        });
      void listDashboardAgendaSources({
        userId,
        isManager: hubPermissions.isManager,
        canViewInstallations: hubPermissions.canViewInstallations,
        canViewDeliveries: hubPermissions.canViewDeliveries,
      }, controller.signal).then(sources => {
        if (!controller.signal.aborted && requestId === requestIdRef.current)
          setStoredAgenda({
            userId, accessKey, agenda: buildDashboardAgenda(rows, sources, now), updatedAt: new Date(),
          });
      }).catch(reason => {
        if (!controller.signal.aborted && requestId === requestIdRef.current)
          setAgendaError(reason instanceof Error ? reason.message : "Falha ao consultar a agenda.");
      });
    } catch (reason) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setError(reason instanceof Error ? reason.message : "Falha ao consultar as ordens.");
      setRefreshing(false);
    }
  }, [
    authorized, userId, accessKey, hubPermissions.isManager,
    hubPermissions.canViewInstallations, hubPermissions.canViewDeliveries,
  ]);

  useEffect(() => {
    if (!authorized) {
      controllerRef.current?.abort();
      requestIdRef.current++;
      return;
    }
    void refresh();
    const periodic = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_INTERVAL);
    const visibleAgain = () => {
      if (document.visibilityState === "visible" &&
          Date.now() - lastSuccessRef.current >= REFRESH_INTERVAL) void refresh();
    };
    document.addEventListener("visibilitychange", visibleAgain);
    return () => {
      window.clearInterval(periodic);
      document.removeEventListener("visibilitychange", visibleAgain);
      requestIdRef.current++;
      controllerRef.current?.abort();
    };
  }, [authorized, refresh]);

  if (!authorized) return null;

  return (
    <div className="evolu-dashboard pb-10" aria-busy={refreshing && !snapshot}>
      <div className="evolu-dashboard__eyebrow">Visão operacional <span aria-hidden="true" /></div>
      <PageHeader
        title="Dashboard operacional"
        description="Prioridades, prazos e andamento das ordens de serviço."
        actions={
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={refreshing}
            aria-label="Atualizar Dashboard">
            <RefreshCw aria-hidden="true" className={"mr-2 h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
            {refreshing ? "Atualizando…" : "Atualizar"}
          </Button>
        }
      />
      <div className="evolu-dashboard__updated" aria-live="polite">
        {snapshot
          ? "Atualizado às " + snapshot.updatedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) + " (SC) · atualização automática a cada 2 min"
          : "Consultando dados operacionais…"}
      </div>
      {error && (
        <div className="evolu-dashboard__error" role="alert">
          {snapshot ? "Não foi possível atualizar. Últimos dados válidos mantidos. " : "Não foi possível carregar o Dashboard. "}
          {error}
          <Button type="button" variant="link" onClick={() => void refresh()}>Tentar novamente</Button>
        </div>
      )}
      {!snapshot && error ? (
        <ErrorState message="Os dados operacionais estão indisponíveis." retry={() => void refresh()} />
      ) : (
        <>
          <OperationalDashboardSections overview={snapshot?.overview ?? null} assignments={assignments}
            agenda={agenda} agendaError={agendaError} />
          <p className="mt-4 text-xs text-muted-foreground">
            Contagens de OS distintas, com acesso limitado pelas permissões existentes. Prazos usam o calendário de Santa Catarina.
            A classificação considera somente bloqueios, urgências e prazos registrados; sem prazo não significa atraso.
          </p>
        </>
      )}
    </div>
  );
}
