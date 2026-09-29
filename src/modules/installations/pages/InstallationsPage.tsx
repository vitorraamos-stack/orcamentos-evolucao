import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
const Empty = ({ children }: { children: string }) => (
  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
    {children}
  </p>
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
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LogisticsOrder | null>(null);
  const [editing, setEditing] = useState<Installation | null>(null);
  const [dialog, setDialog] = useState(false);
  const [teamDialog, setTeamDialog] = useState(false);
  const [cancelling, setCancelling] = useState<Installation | null>(null);
  const [editingTeam, setEditingTeam] = useState<InstallationTeam | null>(null);
  const [routeResult, setRouteResult] = useState<any>(null);
  const [routeDate, setRouteDate] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date()
    )
  );
  const [routeTeam, setRouteTeam] = useState("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadInstallationWorkspace());
    } catch (e) {
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
  const waiting = data.orders.filter(o => isWaitingInstallation(o, activeIds));
  const legacy = data.orders.filter(o => isLegacyInstallation(o, activeIds));
  const teamIds = data.members
    .filter(m => m.user_id === user?.id)
    .map(m => m.team_id);
  const agenda = data.installations.filter(
    i =>
      ["SCHEDULED", "IN_PROGRESS"].includes(i.status) &&
      (!hubPermissions.normalizedRole ||
        hubPermissions.isManager ||
        isMyInstallation(i, user?.id ?? "", teamIds))
  );
  const grouped = groupInstallationsByDay(agenda);
  const act = async (
    action: "start" | "complete" | "cancel",
    i: Installation
  ) => {
    let reason;
    try {
      await installationAction(action, i.id, reason);
      toast.success("Instalação atualizada.");
      await load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
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
    setRouteResult(body);
  };
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instalações</h1>
          <p className="text-sm text-muted-foreground">
            Agenda, equipes, execução e rotas após Material Pronto.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="mr-2 size-4" />
          Atualizar
        </Button>
      </div>
      <Tabs defaultValue="agenda">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="waiting">
            Aguardando{" "}
            <Badge className="ml-2">{waiting.length + legacy.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="teams">Equipes</TabsTrigger>
          <TabsTrigger value="routes">Rotas</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda" className="space-y-5">
          {loading ? (
            <Empty>Carregando agenda…</Empty>
          ) : Object.entries(grouped).length ? (
            Object.entries(grouped).map(([day, rows]) => (
              <section key={day}>
                <h2 className="mb-2 font-semibold">
                  <CalendarDays className="mr-2 inline size-4" />
                  {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    timeZone: "America/Sao_Paulo",
                  })}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {rows.map(i => (
                    <Card key={i.id}>
                      <CardContent className="space-y-3 pt-5">
                        <div className="flex justify-between gap-2">
                          <Link
                            href={`/os/${i.os_id}`}
                            className="font-semibold text-primary"
                          >
                            OS {i.order?.sale_number ?? "—"} ·{" "}
                            {i.order?.client_name ?? ""}
                          </Link>
                          <Badge>{INSTALLATION_STATUS_LABEL[i.status]}</Badge>
                        </div>
                        <p>
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
                              href={buildWazeUrl({
                                address: i.address_snapshot,
                                lat: i.address_lat,
                                lng: i.address_lng,
                              })}
                            >
                              Waze
                            </a>
                          </Button>
                          {hubPermissions.canExecuteInstallations && (
                            <Button asChild size="sm">
                              <Link href={`/instalacoes/execucao/${i.id}`}>
                                {i.status === "SCHEDULED"
                                  ? "Abrir execução"
                                  : "Continuar execução"}
                              </Link>
                            </Button>
                          )}
                          {getInstallationActions({
                            status: i.status,
                            canExecute: hubPermissions.canExecuteInstallations,
                            isManager: hubPermissions.canManageInstallations,
                          }).canReschedule && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing(i);
                                setDialog(true);
                              }}
                            >
                              Reagendar
                            </Button>
                          )}
                          {getInstallationActions({
                            status: i.status,
                            canExecute: hubPermissions.canExecuteInstallations,
                            isManager: hubPermissions.canManageInstallations,
                          }).canCancel && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setCancelling(i)}
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty>Nenhuma instalação na agenda.</Empty>
          )}
        </TabsContent>
        <TabsContent value="waiting">
          <div className="grid gap-3">
            {[...waiting, ...legacy].map(o => (
              <Card key={o.id}>
                <CardContent className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center">
                  <div>
                    <Link
                      href={`/os/${o.id}`}
                      className="font-semibold text-primary"
                    >
                      OS {o.sale_number ?? "—"} · {o.client_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {o.address || "Endereço não informado"}
                    </p>
                    {o.prod_status === "Instalação Agendada" && (
                      <Badge variant="outline">
                        Agendamento legado sem detalhes
                      </Badge>
                    )}
                  </div>
                  {hubPermissions.canManageInstallations && (
                    <Button
                      onClick={() => {
                        setSelected(o);
                        setEditing(null);
                        setDialog(true);
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      Completar agendamento
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {!waiting.length && !legacy.length && (
              <Empty>Nenhuma OS aguardando agendamento.</Empty>
            )}
          </div>
        </TabsContent>
        <TabsContent value="teams">
          <div className="mb-3 flex justify-end">
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
          <div className="grid gap-3 md:grid-cols-2">
            {data.teams.map(t => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle>{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p>
                    Veículo padrão: {t.default_vehicle_label || "Não definido"}
                  </p>
                  <Badge variant={t.active ? "default" : "secondary"}>
                    {t.active ? "Ativa" : "Inativa"}
                  </Badge>
                  <div>
                    <b className="text-sm">Líder:</b>{" "}
                    {(() => {
                      const m = data.members.find(
                        m => m.team_id === t.id && m.is_lead
                      );
                      const p = data.profiles.find(p => p.id === m?.user_id);
                      return p?.name || p?.email || "Não definido";
                    })()}
                  </div>
                  <div>
                    <b className="text-sm">Membros:</b>{" "}
                    {data.members
                      .filter(m => m.team_id === t.id)
                      .map(
                        m =>
                          data.profiles.find(p => p.id === m.user_id)?.name ||
                          data.profiles.find(p => p.id === m.user_id)?.email
                      )
                      .filter(Boolean)
                      .join(", ") || "Nenhum"}
                  </div>
                  {hubPermissions.canManageInstallations && (
                    <Button
                      variant="outline"
                      size="sm"
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
            ))}
          </div>
        </TabsContent>
        <TabsContent value="routes">
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="max-w-52"
                  type="date"
                  value={routeDate}
                  onChange={e => setRouteDate(e.target.value)}
                />
                <select
                  className="h-10 rounded-md border bg-background px-3"
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
                </select>
                {hubPermissions.canManageInstallations && (
                  <Button onClick={optimize} disabled={!routeTeam}>
                    <RouteIcon className="mr-2 size-4" />
                    Otimizar rota
                  </Button>
                )}
              </div>
              {agenda.some(
                i =>
                  i.status === "SCHEDULED" &&
                  saoPauloDateKey(i.scheduled_start) === routeDate &&
                  !i.team_id
              ) && (
                <p className="text-sm text-amber-600">
                  Existem instalações sem equipe definida.
                </p>
              )}
              {routeResult?.unassigned?.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
                >
                  <p className="font-semibold">
                    Algumas instalações não puderam ter a localização validada.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {routeResult.unassigned.map((item: any) => (
                      <li key={item.installation_id ?? item.os_id}>
                        OS {item.sale_number ?? item.os_id}{" "}
                        {item.client_name ? `· ${item.client_name}` : ""} —{" "}
                        {item.address || "Endereço não informado"} —{" "}
                        {(
                          {
                            missing_address: "Endereço não informado",
                            geocode_timeout:
                              "Serviço de localização demorou para responder",
                            geocode_failed: "Endereço não localizado",
                            geocode_low_confidence:
                              "Localização automática pouco confiável",
                            geocode_ambiguous:
                              "Foram encontradas múltiplas localizações possíveis",
                          } as Record<string, string>
                        )[item.reason] ?? item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {routeResult?.groups
                ?.flatMap((g: any) => g.routes)
                .map((r: any) => (
                  <div key={r.routeId} className="rounded-lg border p-3">
                    <p className="font-medium">
                      {(r.summary.distance_m / 1000).toFixed(1)} km ·{" "}
                      {Math.round(r.summary.duration_s / 60)} min
                    </p>
                    {r.stops.map((s: any) => (
                      <p key={s.os_id}>
                        {s.sequence}. OS {s.sale_number} · {s.client_name}
                      </p>
                    ))}
                    <Button asChild className="mt-2">
                      <a href={r.googleMapsUrl} target="_blank">
                        <Navigation className="mr-2 size-4" />
                        Abrir no Google Maps
                      </a>
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <div className="grid gap-3">
            {sortInstallationHistory(
              data.installations.filter(i =>
                ["COMPLETED", "CANCELLED"].includes(i.status)
              )
            )
              .slice(0, 100)
              .map(i => (
                <InstallationHistoryCard key={i.id} installation={i} />
              ))}
          </div>
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
          const id = team.id ?? saved.id;
          await setTeamMembers(id, members);
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
