import { useState } from "react";
import { PreparationBadge } from "./DashboardPreparationBadge";
import { summarizePreparation, type OrderPreparation } from "./dashboardPreparation";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, Truck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  agendaEventTime, filterDashboardAgenda,
  type AgendaEvent, type AgendaFilter, type AgendaPeriod, type DashboardAgenda,
  type PendingScheduleEntry, type PendingScheduleKind,
} from "./dashboardAgenda";

const FILTERS: Array<{ value: AgendaFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "installation", label: "Instalações" },
  { value: "delivery", label: "Entregas" },
  { value: "deadline", label: "Prazos" },
  { value: "late", label: "Sem conclusão" },
  { value: "conflicts", label: "Conflitos" },
];

function EventRow({ event, preparations, leadHours, now }: {
  event: AgendaEvent;
  preparations: Record<string, OrderPreparation> | null;
  leadHours: number;
  now: Date;
}) {
  const Icon = event.kind === "installation" ? Wrench :
    event.kind === "delivery" ? Truck : CalendarDays;
  return (
    <div className="evolu-dashboard__agenda-event">
      <Link href={"/os/" + encodeURIComponent(event.order.id)}
        className="evolu-dashboard__agenda-open"
        aria-label={"Abrir OS " + (event.order.sale_number?.trim() || "sem número") + ": " + event.label}>
      <span className="evolu-dashboard__agenda-event-top">
        <span className="evolu-dashboard__agenda-kind"><Icon aria-hidden="true" className="h-4 w-4" />{event.label}</span>
        <span className="evolu-dashboard__agenda-time">{agendaEventTime(event)}</span>
      </span>
      <span className="evolu-dashboard__agenda-client">
        {event.order.sale_number?.trim() ? "OS " + event.order.sale_number : "OS sem número"}
        <span aria-hidden="true"> · </span>{event.order.client_name?.trim() || "Cliente não informado"}
      </span>
      <span className="evolu-dashboard__agenda-status">{event.status} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></span>
      </Link>
      <PreparationBadge preparation={preparations?.[event.order.id]} event={event} leadHours={leadHours} now={now} />
      {(preparations?.[event.order.id] ? [] : event.warnings).map(warning => (
        <span key={warning} className="evolu-dashboard__agenda-warning">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{warning}
        </span>
      ))}
    </div>
  );
}

function PendingScheduleRow({ entry }: { entry: PendingScheduleEntry }) {
  const reason = entry.kind === "installation" ? "Instalação aguardando agendamento" :
    entry.kind === "delivery" ? "Entrega aguardando agendamento" :
    "Entrega cadastrada sem horário válido";
  const deadline = entry.order.delivery_date
    ? entry.order.delivery_date.split("-").reverse().join("/")
    : "Não informado";
  return (
    <div className="evolu-dashboard__agenda-event">
      <Link href={"/os/" + encodeURIComponent(entry.order.id)}
        className="evolu-dashboard__agenda-open"
        aria-label={"Abrir OS " + (entry.order.sale_number || "sem número") + ": " + reason}>
        <span className="evolu-dashboard__agenda-event-top">
          <span className="evolu-dashboard__agenda-kind">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" /> {reason}
          </span>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="evolu-dashboard__agenda-client">
          {entry.order.sale_number?.trim() ? "OS " + entry.order.sale_number : "OS sem número"}
          <span aria-hidden="true"> · </span>
          {entry.order.client_name?.trim() || "Cliente não informado"}
        </span>
        <span className="evolu-dashboard__agenda-status">
          {entry.order.title?.trim() || "Serviço não informado"} · Prazo: {deadline}
        </span>
      </Link>
    </div>
  );
}

export function DashboardAgendaPanel({
  agenda, error, preparations = null, preparationError, now = new Date(),
}: {
  agenda: DashboardAgenda | null;
  error?: string;
  preparations?: Record<string, OrderPreparation> | null;
  preparationError?: string;
  now?: Date;
}) {
  const [period, setPeriod] = useState<AgendaPeriod>("week");
  const [leadHours, setLeadHours] = useState(48);
  const summary = agenda && preparations ? summarizePreparation(agenda.events, preparations) : null;
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"agenda" | "pending">("agenda");
  const [pendingKind, setPendingKind] = useState<PendingScheduleKind | "all">("all");
  const events = agenda ? filterDashboardAgenda(agenda, period, "all", now) : [];
  const visible = agenda ? filterDashboardAgenda(agenda, period, filter, now).filter(event => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [
      event.order.sale_number, event.order.client_name, event.order.title, event.label,
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term);
  }) : [];

  const openFiltered = (next: AgendaFilter) => {
    setSheetMode("agenda"); setFilter(next); setOpen(true);
  };
  const openPending = (next: PendingScheduleKind) => {
    setSheetMode("pending"); setPendingKind(next); setSearch(""); setOpen(true);
  };
  const pendingEntries = (agenda?.pendingScheduleEntries ?? []).filter(entry => {
    if (pendingKind !== "all" && entry.kind !== pendingKind) return false;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [
      entry.order.sale_number, entry.order.client_name, entry.order.title,
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term);
  });
  return (
    <section aria-labelledby="dashboard-agenda-heading" className="min-w-0">
      <Card className="evolu-dashboard__panel h-full">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle id="dashboard-agenda-heading" className="text-base">Agenda operacional</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Compromissos e prazos registrados.</p>
          </div>
          <CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          <div className="evolu-dashboard__agenda-period" role="group" aria-label="Período da agenda">
            <Button type="button" variant={period === "today" ? "default" : "outline"} size="sm"
              onClick={() => setPeriod("today")} aria-pressed={period === "today"}>Hoje</Button>
            <Button type="button" variant={period === "week" ? "default" : "outline"} size="sm"
              onClick={() => setPeriod("week")} aria-pressed={period === "week"}>Próximos 7 dias</Button>
          </div>
          <div className="evolu-dashboard__prep-lead">
            <label htmlFor="dashboard-prep-lead" className="text-xs text-muted-foreground">Antecedência dos alertas</label>
            <select id="dashboard-prep-lead" value={leadHours} onChange={e => setLeadHours(Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-xs">
              <option value={24}>24 horas</option>
              <option value={48}>48 horas</option>
              <option value={72}>72 horas</option>
            </select>
          </div>
          {preparationError && <p role="alert" className="evolu-dashboard__agenda-error">
            Prontidão não disponível: {preparationError}
          </p>}
          {summary && <div className="evolu-dashboard__prep-summary" aria-label="Preparação operacional por OS">
            <span><strong>{summary.pending}</strong> OS pendente(s)</span>
            <span><strong>{summary.partial}</strong> OS parcialmente preparada(s)</span>
            <span><strong>{summary.unverified}</strong> OS sem prontidão verificada</span>
          </div>}
          {!agenda ? (
            <div role="status" aria-label="Carregando agenda" className="space-y-2">
              {error
                ? <p className="evolu-dashboard__agenda-error">Agenda indisponível: {error}</p>
                : [1, 2, 3].map(index => <div key={index} className="evolu-dashboard__skeleton h-20" />)}
            </div>
          ) : (
            <>
              <div className="evolu-dashboard__agenda-list">
                {events.length
                  ? events.slice(0, 5).map(event => <EventRow key={event.key} event={event}
                    preparations={preparations} leadHours={leadHours} now={now} />)
                  : <p className="evolu-dashboard__empty">Nenhum compromisso ou prazo registrado neste período.</p>}
              </div>
              {events.length > 5 &&
                <p className="text-xs text-muted-foreground">{events.length - 5} registro(s) adicional(is) na agenda completa.</p>}
              <div className="evolu-dashboard__agenda-attention">
                {agenda.waitingInstallations !== null &&
                  <button type="button" className="evolu-dashboard__agenda-chip"
                    onClick={() => openPending("installation")}>
                    <strong>{agenda.waitingInstallations}</strong> instalação(ões) sem agendamento <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>}
                {agenda.waitingDeliveries !== null &&
                  <button type="button" className="evolu-dashboard__agenda-chip"
                    onClick={() => openPending("delivery")}>
                    <strong>{agenda.waitingDeliveries}</strong> entrega(s) sem agendamento <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>}
                {agenda.deliveriesWithoutTime !== null && agenda.deliveriesWithoutTime > 0 &&
                  <button type="button" className="evolu-dashboard__agenda-chip"
                    onClick={() => openPending("delivery_missing_time")}>
                    <strong>{agenda.deliveriesWithoutTime}</strong> entrega(s) cadastrada(s) sem horário
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>}
                {agenda.overdueWithoutCompletion > 0 &&
                  <button type="button" className="evolu-dashboard__agenda-chip" onClick={() => openFiltered("late")}>
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    <strong>{agenda.overdueWithoutCompletion}</strong> sem conclusão registrada
                  </button>}
                {agenda.conflicts > 0 &&
                  <button type="button" className="evolu-dashboard__agenda-chip" onClick={() => openFiltered("conflicts")}>
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <strong>{agenda.conflicts}</strong> em conflito de horário
                  </button>}
                {agenda.missingInformation > 0 &&
                  <span className="evolu-dashboard__agenda-chip">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <strong>{agenda.missingInformation}</strong> com informação pendente
                  </span>}
              </div>
            </>
          )}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="w-full"
                onClick={() => { setSheetMode("agenda"); setFilter("all"); setSearch(""); }} disabled={!agenda}>
                Agenda completa <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-xl" side="right">
              <SheetHeader>
                <SheetTitle>
                  {sheetMode === "pending" ? "OS com agendamento pendente" : "Agenda operacional completa"}
                </SheetTitle>
                <SheetDescription>
                  {sheetMode === "pending"
                    ? "Instalações e entregas sem agendamento ou horário registrado. Consulta sem edição."
                    : "Consulta dos registros existentes, sem edição. O período é preservado ao abrir e fechar."}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
                {sheetMode === "pending" ? (
                  <>
                    <label className="text-sm font-medium" htmlFor="dashboard-pending-filter">
                      Tipo de pendência
                    </label>
                    <select id="dashboard-pending-filter" value={pendingKind}
                      onChange={event => setPendingKind(event.target.value as PendingScheduleKind | "all")}
                      className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="all">Todas as pendências disponíveis</option>
                      {agenda && agenda.waitingInstallations !== null &&
                        <option value="installation">Instalações sem agendamento</option>}
                      {agenda && agenda.waitingDeliveries !== null &&
                        <option value="delivery">Entregas sem agendamento</option>}
                      {agenda && agenda.deliveriesWithoutTime !== null &&
                        <option value="delivery_missing_time">Entregas sem horário</option>}
                    </select>
                    <Input type="search" aria-label="Buscar pendências de agendamento"
                      placeholder="Buscar OS, cliente ou serviço" value={search}
                      onChange={event => setSearch(event.target.value)} />
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {pendingEntries.length} registro(s) encontrados. Os compromissos sem data
                      não são inseridos artificialmente no calendário.
                    </p>
                    <div className="space-y-2">
                      {pendingEntries.length
                        ? pendingEntries.map(entry => <PendingScheduleRow key={entry.key} entry={entry} />)
                        : <p className="evolu-dashboard__empty">
                            Nenhuma pendência corresponde aos filtros ou às suas permissões.
                          </p>}
                    </div>
                  </>
                ) : (
                  <>
                <div className="evolu-dashboard__agenda-period" role="group" aria-label="Período da agenda completa">
                  <Button type="button" size="sm" variant={period === "today" ? "default" : "outline"}
                    onClick={() => setPeriod("today")}>Hoje</Button>
                  <Button type="button" size="sm" variant={period === "week" ? "default" : "outline"}
                    onClick={() => setPeriod("week")}>Próximos 7 dias</Button>
                </div>
                <label className="text-sm font-medium" htmlFor="dashboard-agenda-filter">Tipo de registro</label>
                <select id="dashboard-agenda-filter" value={filter}
                  onChange={event => setFilter(event.target.value as AgendaFilter)}
                  className="h-10 rounded-md border bg-background px-3 text-sm">
                  {FILTERS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <Input type="search" aria-label="Buscar compromissos" placeholder="Buscar OS, cliente ou serviço"
                  value={search} onChange={event => setSearch(event.target.value)} />
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {visible.length} registro(s) · {filter === "late" || filter === "conflicts" ? "pendências independentemente do período" : period === "today" ? "Hoje" : "Próximos 7 dias"}
                </p>
                <div className="space-y-2">
                  {visible.length
                    ? visible.map(event => <EventRow key={event.key} event={event}
                      preparations={preparations} leadHours={leadHours} now={now} />)
                    : <p className="evolu-dashboard__empty">Nenhum registro corresponde aos filtros.</p>}
                </div>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </CardContent>
      </Card>
    </section>
  );
}
