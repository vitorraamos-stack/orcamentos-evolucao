import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstallationScheduleDialog } from "../components/InstallationScheduleDialog";
import { InstallationTeamDialog } from "../components/InstallationTeamDialog";
import { InstallationHistoryCard } from "../components/InstallationHistoryCard";
import {
  installationAction,
  loadInstallationWorkspace,
  rescheduleInstallation,
  saveTeam,
  setTeamMembers,
  scheduleInstallation,
} from "../repositories/installationsRepository";
import {
  buildMapsUrl,
  buildWazeUrl,
  formatAgendaDate,
  groupInstallationsByDay,
  INSTALLATION_STATUS_LABEL,
  isLegacyInstallation,
  isMyInstallation,
  isWaitingInstallation,
  getInstallationActions,
  sortInstallationHistory,
} from "../services/installations";
import { saoPauloDateKey } from "@/shared/lib/saoPauloTime";
import type { Installation, InstallationTeam, LogisticsOrder } from "../types";
import { MutationInputDialog } from "@/shared/components/MutationInputDialog";
import {
  filterAgendaInstallations,
  filterInstallationsByWeek,
  filterHistoryInstallations,
  formatInstallationTime,
  formatRouteDistance,
  formatRouteDuration,
  getSaoPauloWeekDays,
  getSaoPauloWeekRange,
  getTeamSchedulePresentation,
  isScheduledInstallationOverdue,
  sortWaitingOrders,
  shiftWeekStart,
  summarizeInstallations,
  type AgendaQuickFilter,
  type HistoryPeriod,
  type HistoryStatus,
} from "../presentation/installationsPresentation";

type InstallationTab = "agenda" | "waiting" | "teams" | "routes" | "history";
type AgendaView = "week" | "list";
type RouteStop = {
  sequence: number;
  installation_id?: string;
  os_id: string;
  address: string | null;
  client_name: string;
  sale_number: string;
};
type InstallationRouteResult = {
  stats: {
    totalCandidates: number;
    geocoded: number;
    notGeocoded: number;
    groups: number;
    routes: number;
  };
  unassigned: Array<{
    installation_id?: string;
    os_id: string;
    reason: string;
    address: string | null;
    client_name: string;
    sale_number: string;
  }>;
  groups: Array<{
    groupId: string;
    routes: Array<{
      routeId: string;
      summary: { distance_m: number | null; duration_s: number | null };
      stops: RouteStop[];
      googleMapsUrl: string | null;
    }>;
  }>;
};

const Empty = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-xl border border-dashed px-4 py-8 text-center">
    <CalendarCheck className="mx-auto mb-2 size-6 text-muted-foreground" />
    <p className="font-medium">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className={cn(
      "h-10 rounded-md border bg-background px-3 text-sm",
      props.className
    )}
  />
);

export default function InstallationsPage() {
  const { user, hubPermissions } = useAuth();
  const [data, setData] = useState<{
    installations: Installation[];
    teams: InstallationTeam[];
    members: any[];
    orders: LogisticsOrder[];
    profiles: any[];
  }>({ installations: [], teams: [], members: [], orders: [], profiles: [] });
  const [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<InstallationTab>("agenda"),
    [agendaView, setAgendaView] = useState<AgendaView>("week"),
    [agendaQuickFilter, setAgendaQuickFilter] =
      useState<AgendaQuickFilter>("all");
  const [weekStart, setWeekStart] = useState(getSaoPauloWeekRange().start);
  const [waitingSearch, setWaitingSearch] = useState(""),
    [waitingSort, setWaitingSort] = useState<"deadline" | "client" | "os">(
      "deadline"
    );
  const [historySearch, setHistorySearch] = useState(""),
    [historyStatus, setHistoryStatus] = useState<HistoryStatus>("all"),
    [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("all"),
    [historyTeam, setHistoryTeam] = useState("");
  const [selected, setSelected] = useState<LogisticsOrder | null>(null),
    [editing, setEditing] = useState<Installation | null>(null),
    [dialog, setDialog] = useState(false);
  const [teamDialog, setTeamDialog] = useState(false),
    [cancelling, setCancelling] = useState<Installation | null>(null),
    [editingTeam, setEditingTeam] = useState<InstallationTeam | null>(null);
  const [routeResult, setRouteResult] =
      useState<InstallationRouteResult | null>(null),
    [routeDate, setRouteDate] = useState(() =>
      saoPauloDateKey(new Date().toISOString())
    ),
    [routeTeam, setRouteTeam] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    waitingRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadInstallationWorkspace());
      setLastUpdatedAt(new Date());
      setInitialError(false);
    } catch (e) {
      setInitialError(true);
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("phase4-installations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_installations" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_installation_teams" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_installation_team_members" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_orders" },
        refresh
      )
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const activeIds = new Set(
    data.installations
      .filter(i => ["SCHEDULED", "IN_PROGRESS"].includes(i.status))
      .map(i => i.os_id)
  );
  const waiting = data.orders.filter(o => isWaitingInstallation(o, activeIds)),
    legacy = data.orders.filter(o => isLegacyInstallation(o, activeIds));
  const teamIds = data.members
    .filter(m => m.user_id === user?.id)
    .map(m => m.team_id);
  const visible = (i: Installation) =>
    !hubPermissions.normalizedRole ||
    hubPermissions.isManager ||
    isMyInstallation(i, user?.id ?? "", teamIds);
  const globalActiveInstallations = data.installations.filter(i =>
    ["SCHEDULED", "IN_PROGRESS"].includes(i.status)
  );
  const canInspectGlobalTeamSchedule = hubPermissions.isManager;
  const agenda = data.installations.filter(
    i => ["SCHEDULED", "IN_PROGRESS"].includes(i.status) && visible(i)
  );
  const history = data.installations.filter(
    i => ["COMPLETED", "CANCELLED"].includes(i.status) && visible(i)
  );
  const summary = summarizeInstallations(
    agenda,
    history,
    waiting.length + legacy.length
  );
  const filteredAgenda = filterAgendaInstallations(agenda, agendaQuickFilter),
    grouped = groupInstallationsByDay(filteredAgenda);
  const weekDays = getSaoPauloWeekDays(weekStart),
    weekEnd = weekDays[6];
  const weekAgenda = filterInstallationsByWeek(filteredAgenda, weekStart);
  const waitingRows = sortWaitingOrders(
    [...waiting, ...legacy].filter(o =>
      `${o.sale_number ?? ""} ${o.client_name} ${o.address ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(waitingSearch.toLocaleLowerCase("pt-BR"))
    ),
    waitingSort
  );
  const historyRows = sortInstallationHistory(
    filterHistoryInstallations(history, {
      search: historySearch,
      status: historyStatus,
      period: historyPeriod,
      teamId: historyTeam,
    })
  ).slice(0, 100);

  const goSummary = (
    kind: "today" | "waiting" | "progress" | "overdue" | "completed"
  ) => {
    if (kind === "waiting") {
      setActiveTab("waiting");
      setTimeout(
        () =>
          waitingRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0
      );
      return;
    }
    if (kind === "completed") {
      setActiveTab("history");
      setHistoryStatus("completed");
      setHistoryPeriod("week");
      return;
    }
    setActiveTab("agenda");
    setAgendaView("list");
    setAgendaQuickFilter(
      kind === "today"
        ? "today"
        : kind === "progress"
          ? "in_progress"
          : "overdue"
    );
  };
  const optimize = async () => {
    const ids = agenda
      .filter(
        i =>
          i.status === "SCHEDULED" &&
          saoPauloDateKey(i.scheduled_start) === routeDate &&
          i.team_id === routeTeam
      )
      .map(i => i.id);
    if (!routeTeam) return toast.error("Selecione uma equipe.");
    if (!ids.length)
      return toast.error("Nenhuma instalação agendada para a seleção.");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch("/api/hub-os/optimize-installations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ installationIds: ids }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error);
    setRouteResult(body as InstallationRouteResult);
  };
  const weekLabel = `${new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit" })}–${new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }).toUpperCase()}`;

  if (loading && !lastUpdatedAt)
    return (
      <main className="w-full space-y-4 pb-10">
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </main>
    );
  if (initialError && !lastUpdatedAt)
    return (
      <Empty
        title="Não foi possível carregar Instalações."
        description="Tente novamente para carregar a central operacional."
        action={<Button onClick={load}>Tentar novamente</Button>}
      />
    );

  const summaryCards = [
    {
      key: "today",
      label: "Hoje",
      value: summary.today,
      tone: "border-primary/30",
      active: activeTab === "agenda" && agendaQuickFilter === "today",
    },
    {
      key: "waiting",
      label: "Aguardando agendamento",
      value: summary.waiting,
      tone: "border-amber-300",
      active: activeTab === "waiting",
    },
    {
      key: "progress",
      label: "Em execução",
      value: summary.inProgress,
      tone: "border-blue-300",
      active: activeTab === "agenda" && agendaQuickFilter === "in_progress",
    },
    {
      key: "overdue",
      label: "Atrasadas",
      value: summary.overdue,
      tone: "border-destructive/40",
      active: activeTab === "agenda" && agendaQuickFilter === "overdue",
      aria: "Instalações agendadas cujo horário já passou",
    },
    {
      key: "completed",
      label: "Concluídas na semana",
      value: summary.completedWeek,
      tone: "border-emerald-300",
      active:
        activeTab === "history" &&
        historyStatus === "completed" &&
        historyPeriod === "week",
    },
  ] as const;

  return (
    <main className="w-full space-y-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instalações</h1>
          <p className="text-sm text-muted-foreground">
            Agenda, equipes, execução e rotas após Material Pronto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {lastUpdatedAt &&
              `Atualizado às ${lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw
              className={cn("mr-2 size-4", loading && "animate-spin")}
            />
            Atualizar
          </Button>
          {hubPermissions.canManageInstallations && (
            <Button
              onClick={() => {
                if (!summary.waiting)
                  return toast.info("Não existem OS aguardando agendamento.");
                goSummary("waiting");
              }}
            >
              <Plus className="mr-2 size-4" />
              Agendar instalação
            </Button>
          )}
        </div>
      </header>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map(card => (
          <button
            key={card.key}
            aria-label={("aria" in card ? card.aria : undefined) ?? card.label}
            aria-pressed={card.active}
            onClick={() => goSummary(card.key)}
            className={cn(
              "h-20 rounded-xl border bg-card px-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              card.tone,
              card.active &&
                "border-primary bg-primary/5 ring-1 ring-primary/30"
            )}
          >
            <span className="block text-xs font-medium text-muted-foreground">
              {card.label}
            </span>
            <strong className="mt-1 block text-2xl">{card.value}</strong>
          </button>
        ))}
      </section>
      <Tabs
        value={activeTab}
        onValueChange={v => setActiveTab(v as InstallationTab)}
      >
        <div className="overflow-x-auto border-b">
          <TabsList className="h-auto w-max bg-transparent">
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="waiting">
              Aguardando agendamento{" "}
              <Badge variant="secondary" className="ml-2">
                {summary.waiting}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="teams">Equipes</TabsTrigger>
            <TabsTrigger value="routes">Rotas</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="agenda" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {agendaQuickFilter !== "all" && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {
                      {
                        today: "Hoje",
                        in_progress: "Em execução",
                        overdue: "Atrasadas",
                        all: "",
                      }[agendaQuickFilter]
                    }
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAgendaQuickFilter("all")}
                  >
                    Limpar filtro
                  </Button>
                </div>
              )}
            </div>
            <div className="rounded-md border p-1">
              <Button
                size="sm"
                variant={agendaView === "week" ? "secondary" : "ghost"}
                onClick={() => setAgendaView("week")}
              >
                Semana
              </Button>
              <Button
                size="sm"
                variant={agendaView === "list" ? "secondary" : "ghost"}
                onClick={() => setAgendaView("list")}
              >
                Lista
              </Button>
            </div>
          </div>
          {agendaView === "week" ? (
            <>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Semana anterior"
                  onClick={() => setWeekStart(shiftWeekStart(weekStart, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <strong className="min-w-44 text-center text-sm">
                  {weekLabel}
                </strong>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekStart(getSaoPauloWeekRange().start)}
                >
                  Hoje
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Próxima semana"
                  onClick={() => setWeekStart(shiftWeekStart(weekStart, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              {weekAgenda.length ? (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[980px] grid-cols-7 gap-2">
                    {weekDays.map(day => {
                      const rows = weekAgenda.filter(
                        i => saoPauloDateKey(i.scheduled_start) === day
                      );
                      const today =
                        day === saoPauloDateKey(new Date().toISOString());
                      return (
                        <section
                          key={day}
                          className={cn(
                            "min-h-56 rounded-lg border p-2",
                            today && "border-primary/30 bg-primary/5"
                          )}
                        >
                          <h3 className="mb-2 text-center text-xs font-semibold uppercase">
                            {new Date(`${day}T12:00:00Z`).toLocaleDateString(
                              "pt-BR",
                              { weekday: "short", day: "2-digit" }
                            )}
                          </h3>
                          <div className="space-y-2">
                            {rows.map(i => (
                              <div
                                key={i.id}
                                className={cn(
                                  "rounded-md border bg-card p-2 text-xs",
                                  i.status === "IN_PROGRESS" &&
                                    "border-blue-400"
                                )}
                              >
                                <b>
                                  {formatInstallationTime(i.scheduled_start)}
                                </b>
                                <Link
                                  href={`/os/${i.os_id}`}
                                  className="mt-1 block font-semibold text-primary"
                                >
                                  OS #{i.order?.sale_number ?? "—"}
                                </Link>
                                <p className="truncate">
                                  {i.order?.client_name}
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                  {i.team?.name ?? "Sem equipe"}
                                  {i.vehicle_label && ` · ${i.vehicle_label}`}
                                </p>
                                <Badge
                                  className="mt-2"
                                  variant={
                                    isScheduledInstallationOverdue(i)
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {isScheduledInstallationOverdue(i)
                                    ? "ATRASADA"
                                    : INSTALLATION_STATUS_LABEL[i.status]}
                                </Badge>
                                {hubPermissions.canExecuteInstallations && (
                                  <Link
                                    className="mt-2 block text-primary underline"
                                    href={`/instalacoes/execucao/${i.id}`}
                                  >
                                    {i.status === "IN_PROGRESS"
                                      ? "Continuar execução"
                                      : "Abrir execução"}
                                  </Link>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Empty
                  title="Nenhuma instalação na agenda"
                  description={
                    agendaQuickFilter === "today"
                      ? "Nenhuma instalação programada para hoje."
                      : agendaQuickFilter === "overdue"
                        ? "Nenhuma instalação atrasada."
                        : agendaQuickFilter === "in_progress"
                          ? "Nenhuma instalação em execução."
                          : "Nenhuma instalação programada nesta semana."
                  }
                  action={
                    hubPermissions.canManageInstallations && summary.waiting ? (
                      <Button onClick={() => goSummary("waiting")}>
                        Ver OS aguardando agendamento
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          ) : agendaView === "list" ? (
            <AgendaList
              grouped={grouped}
              canManage={hubPermissions.canManageInstallations}
              canExecute={hubPermissions.canExecuteInstallations}
              onEdit={i => {
                setEditing(i);
                setDialog(true);
              }}
              onCancel={setCancelling}
            />
          ) : null}
          {agendaView === "list" && !filteredAgenda.length && (
            <Empty
              title="Nenhuma instalação na agenda"
              description={
                agendaQuickFilter === "today"
                  ? "Nenhuma instalação programada para hoje."
                  : agendaQuickFilter === "overdue"
                    ? "Nenhuma instalação atrasada."
                    : agendaQuickFilter === "in_progress"
                      ? "Nenhuma instalação em execução."
                      : "Nenhuma instalação na agenda."
              }
              action={
                hubPermissions.canManageInstallations && summary.waiting ? (
                  <Button onClick={() => goSummary("waiting")}>
                    Ver OS aguardando agendamento
                  </Button>
                ) : undefined
              }
            />
          )}
        </TabsContent>
        <TabsContent value="waiting" ref={waitingRef} className="space-y-4">
          <div>
            <h2 className="font-semibold">Aguardando agendamento</h2>
            <p className="text-sm text-muted-foreground">
              OS com material pronto que ainda precisam de data, equipe e
              responsável.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="Buscar por OS, cliente ou endereço..."
              value={waitingSearch}
              onChange={e => setWaitingSearch(e.target.value)}
            />
            <Select
              value={waitingSort}
              onChange={e =>
                setWaitingSort(e.target.value as typeof waitingSort)
              }
            >
              <option value="deadline">Prazo</option>
              <option value="client">Cliente</option>
              <option value="os">OS</option>
            </Select>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {waitingRows.map(o => {
              const isLegacy = o.prod_status === "Instalação Agendada",
                overdue = Boolean(
                  o.delivery_date &&
                  o.delivery_date < saoPauloDateKey(new Date().toISOString())
                );
              return (
                <Card key={o.id}>
                  <CardContent className="flex h-full flex-col justify-between gap-3 pt-5">
                    <div>
                      <Link
                        href={`/os/${o.id}`}
                        className="font-semibold text-primary"
                      >
                        OS #{o.sale_number ?? "—"} · {o.client_name}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {o.address || "Endereço não informado"}
                      </p>
                      <p className="mt-2 text-sm">
                        Prazo:{" "}
                        {o.delivery_date
                          ? new Date(
                              `${o.delivery_date}T12:00:00Z`
                            ).toLocaleDateString("pt-BR")
                          : "Sem prazo"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {overdue && (
                          <Badge variant="destructive">Prazo vencido</Badge>
                        )}
                        {isLegacy && (
                          <Badge variant="outline">
                            Agendamento legado sem detalhes
                          </Badge>
                        )}
                      </div>
                    </div>
                    {hubPermissions.canManageInstallations && (
                      <Button
                        className="self-start"
                        onClick={() => {
                          setSelected(o);
                          setEditing(null);
                          setDialog(true);
                        }}
                      >
                        <Plus className="mr-2 size-4" />
                        {isLegacy
                          ? "Completar agendamento"
                          : "Agendar instalação"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {!waitingRows.length && (
            <Empty
              title="Nenhuma OS aguardando agendamento"
              description="Todas as OS prontas para instalação já foram programadas."
            />
          )}
        </TabsContent>
        <TabsContent value="teams" className="space-y-3">
          <div className="flex justify-end">
            {hubPermissions.canManageInstallations && (
              <Button
                onClick={() => {
                  setEditingTeam(null);
                  setTeamDialog(true);
                }}
              >
                <Users className="mr-2 size-4" />
                Nova equipe
              </Button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...data.teams]
              .sort((a, b) => Number(b.active) - Number(a.active))
              .map(t => {
                const members = data.members.filter(m => m.team_id === t.id);
                const teamScheduleSource = canInspectGlobalTeamSchedule
                  ? globalActiveInstallations
                  : teamIds.includes(t.id)
                    ? agenda
                    : null;
                const schedule = teamScheduleSource
                  ? getTeamSchedulePresentation({
                      teamId: t.id,
                      installations: teamScheduleSource,
                    })
                  : null;
                const lead = members.find(m => m.is_lead);
                const name = (id: string) => {
                  const p = data.profiles.find(p => p.id === id);
                  return p?.name || p?.email;
                };
                return (
                  <Card key={t.id} className={cn(!t.active && "opacity-65")}>
                    <CardContent className="space-y-2 pt-5">
                      <div className="flex justify-between">
                        <b>{t.name}</b>
                        <Badge variant={t.active ? "default" : "secondary"}>
                          {t.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        <b>Líder:</b>{" "}
                        {lead ? name(lead.user_id) : "Não definido"}
                      </p>
                      <p className="text-sm">
                        <b>Membros:</b>{" "}
                        {members
                          .map(m => name(m.user_id))
                          .filter(Boolean)
                          .join(", ") || "Nenhum"}
                      </p>
                      <p className="text-sm">
                        <b>Veículo:</b>{" "}
                        {t.default_vehicle_label || "Não definido"}
                      </p>
                      {schedule &&
                        (t.active && schedule.todayCount === 0 ? (
                          <Badge variant="outline">Livre hoje</Badge>
                        ) : (
                          <p className="text-sm">
                            <b>Hoje:</b> {schedule.todayCount}{" "}
                            {schedule.todayCount === 1
                              ? "instalação"
                              : "instalações"}{" "}
                            hoje
                          </p>
                        ))}
                      {schedule && (
                        <p className="text-sm">
                          <b>Próxima:</b>{" "}
                          {schedule.nextInstallation
                            ? `${formatAgendaDate(schedule.nextInstallation.scheduled_start)} · ${schedule.nextInstallation.order?.client_name ?? "Cliente não informado"}`
                            : "Nenhuma próxima instalação"}
                        </p>
                      )}
                      {hubPermissions.canManageInstallations && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingTeam(t);
                            setTeamDialog(true);
                          }}
                        >
                          Editar
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
          {!data.teams.length && (
            <Empty
              title="Nenhuma equipe cadastrada"
              description="Cadastre uma equipe para organizar a agenda."
            />
          )}
        </TabsContent>
        <TabsContent value="routes" className="space-y-4">
          <div>
            <h2 className="font-semibold">Planejamento de rotas</h2>
            <p className="text-sm text-muted-foreground">
              Otimize a sequência das instalações agendadas por equipe e data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-52"
              type="date"
              aria-label="Data"
              value={routeDate}
              onChange={e => setRouteDate(e.target.value)}
            />
            <Select
              aria-label="Equipe"
              value={routeTeam}
              onChange={e => setRouteTeam(e.target.value)}
            >
              <option value="">Selecione a equipe *</option>
              {data.teams
                .filter(t => t.active)
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
            {hubPermissions.canManageInstallations && (
              <Button onClick={optimize}>
                <RouteIcon className="mr-2 size-4" />
                Otimizar rota
              </Button>
            )}
          </div>
          {!routeResult && (
            <Empty
              title="Selecione data e equipe para planejar a rota."
              description="A sequência será calculada usando as instalações agendadas."
            />
          )}
          {routeResult && <RouteResult result={routeResult} />}
        </TabsContent>
        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-sm"
              placeholder="Buscar por OS ou cliente..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
            />
            <Select
              value={historyStatus}
              onChange={e => setHistoryStatus(e.target.value as HistoryStatus)}
            >
              <option value="all">Todos</option>
              <option value="completed">Concluídas</option>
              <option value="cancelled">Canceladas</option>
            </Select>
            <Select
              value={historyPeriod}
              onChange={e => setHistoryPeriod(e.target.value as HistoryPeriod)}
            >
              <option value="week">Esta semana</option>
              <option value="month">Este mês</option>
              <option value="all">Todo período</option>
            </Select>
            <Select
              value={historyTeam}
              onChange={e => setHistoryTeam(e.target.value)}
            >
              <option value="">Todas as equipes</option>
              {data.teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            {(historySearch ||
              historyStatus !== "all" ||
              historyPeriod !== "all" ||
              historyTeam) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setHistorySearch("");
                  setHistoryStatus("all");
                  setHistoryPeriod("all");
                  setHistoryTeam("");
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {historyRows.map(i => (
              <InstallationHistoryCard key={i.id} installation={i} />
            ))}
          </div>
          {!historyRows.length && (
            <Empty
              title={
                history.length
                  ? "Nenhum resultado para os filtros selecionados."
                  : "Nenhuma instalação concluída ou cancelada."
              }
              description={
                history.length
                  ? "Ajuste ou limpe os filtros para consultar o histórico."
                  : "As conclusões e cancelamentos aparecerão aqui."
              }
            />
          )}
        </TabsContent>
      </Tabs>
      <InstallationScheduleDialog
        order={selected}
        installation={editing}
        teams={data.teams}
        members={data.members}
        profiles={data.profiles}
        open={dialog}
        onOpenChange={setDialog}
        onSave={async input => {
          if (editing) await rescheduleInstallation(editing.id, input);
          else await scheduleInstallation(input);
          toast.success("Agendamento salvo.");
          await load();
        }}
      />
      <InstallationTeamDialog
        open={teamDialog}
        onOpenChange={setTeamDialog}
        team={editingTeam}
        members={data.members}
        profiles={data.profiles}
        onSave={async (team, members) => {
          const saved = await saveTeam(team);
          await setTeamMembers(team.id ?? saved.id, members);
          toast.success("Equipe salva.");
          await load();
        }}
      />
      <MutationInputDialog
        open={Boolean(cancelling)}
        onOpenChange={v => {
          if (!v) setCancelling(null);
        }}
        title="Cancelar instalação"
        label="Motivo"
        required
        confirmLabel="Confirmar cancelamento"
        onConfirm={async reason => {
          if (cancelling)
            await installationAction("cancel", cancelling.id, reason);
          toast.success("Instalação cancelada.");
          await load();
        }}
      />
    </main>
  );
}

function AgendaList({
  grouped,
  canManage,
  canExecute,
  onEdit,
  onCancel,
}: {
  grouped: Record<string, Installation[]>;
  canManage: boolean;
  canExecute: boolean;
  onEdit: (i: Installation) => void;
  onCancel: (i: Installation) => void;
}) {
  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([day, rows]) => (
        <section key={day}>
          <h2 className="mb-2 font-semibold uppercase">
            <CalendarDays className="mr-2 inline size-4" />
            {new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}{" "}
            ·{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {rows.length} {rows.length === 1 ? "instalação" : "instalações"}
            </span>
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map(i => {
              const actions = getInstallationActions({
                  status: i.status,
                  canExecute,
                  isManager: canManage,
                }),
                overdue = isScheduledInstallationOverdue(i);
              return (
                <Card
                  key={i.id}
                  className={cn(
                    i.status === "IN_PROGRESS" && "border-blue-400"
                  )}
                >
                  <CardContent className="space-y-2 pt-5">
                    <div className="flex justify-between gap-2">
                      <Link
                        href={`/os/${i.os_id}`}
                        className="font-semibold text-primary"
                      >
                        OS #{i.order?.sale_number ?? "—"} ·{" "}
                        {i.order?.client_name}
                      </Link>
                      <div className="flex gap-1">
                        {overdue && (
                          <Badge variant="destructive">ATRASADA</Badge>
                        )}
                        <Badge>{INSTALLATION_STATUS_LABEL[i.status]}</Badge>
                      </div>
                    </div>
                    <p className="text-sm">
                      <Clock3 className="mr-1 inline size-4" />
                      {overdue ? "Agendada para " : ""}
                      {formatAgendaDate(i.scheduled_start)} ·{" "}
                      {i.team?.name ?? "Sem equipe"} ·{" "}
                      {i.vehicle_label ?? "Sem veículo"}
                    </p>
                    <p className="text-sm">
                      Responsável:{" "}
                      {i.responsible?.name ||
                        i.responsible?.email ||
                        "Responsável não definido"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <MapPin className="mr-1 inline size-4" />
                      {i.address_snapshot || "Endereço não informado"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir endereço no Google Maps"
                          href={buildMapsUrl({
                            address: i.address_snapshot,
                            lat: i.address_lat,
                            lng: i.address_lng,
                          })}
                        >
                          Maps
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir endereço no Waze"
                          href={buildWazeUrl({
                            address: i.address_snapshot,
                            lat: i.address_lat,
                            lng: i.address_lng,
                          })}
                        >
                          Waze
                        </a>
                      </Button>
                      {canExecute && (
                        <Button asChild size="sm">
                          <Link href={`/instalacoes/execucao/${i.id}`}>
                            {i.status === "SCHEDULED"
                              ? "Abrir execução"
                              : "Continuar execução"}
                          </Link>
                        </Button>
                      )}
                      {actions.canReschedule && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(i)}
                        >
                          Reagendar
                        </Button>
                      )}
                      {actions.canCancel && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onCancel(i)}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
function RouteResult({ result }: { result: InstallationRouteResult }) {
  const routes = result.groups.flatMap(g => g.routes),
    distance = routes.reduce((n, r) => n + (r.summary.distance_m ?? 0), 0),
    duration = routes.reduce((n, r) => n + (r.summary.duration_s ?? 0), 0),
    stops = routes.reduce((n, r) => n + r.stops.length, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Paradas", String(stops)],
          ["Distância", formatRouteDistance(distance)],
          ["Tempo estimado", formatRouteDuration(duration)],
          ["Não alocadas", String(result.unassigned.length)],
        ].map(([l, v]) => (
          <Card key={l}>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">{l}</p>
              <b>{v}</b>
            </CardContent>
          </Card>
        ))}
      </div>
      {routes.map(r => (
        <Card key={r.routeId}>
          <CardContent className="space-y-3 pt-5">
            <div className="space-y-2">
              {r.stops.map(s => (
                <div
                  key={`${s.os_id}-${s.sequence}`}
                  className="flex gap-3 border-b pb-2"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {s.sequence}
                  </span>
                  <div>
                    <b>
                      OS #{s.sale_number} · {s.client_name}
                    </b>
                    <p className="text-sm text-muted-foreground">
                      {s.address || "Endereço não informado"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {r.googleMapsUrl && (
              <Button asChild>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir rota no Google Maps"
                  href={r.googleMapsUrl}
                >
                  <Navigation className="mr-2 size-4" />
                  Abrir rota no Google Maps
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
      {result.unassigned.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
        >
          <b>Não foi possível incluir</b>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {result.unassigned.map(i => (
              <li key={i.installation_id ?? i.os_id}>
                OS #{i.sale_number} · {i.client_name} — {i.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
