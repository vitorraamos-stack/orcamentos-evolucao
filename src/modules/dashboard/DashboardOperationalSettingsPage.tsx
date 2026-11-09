import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, History, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import type { OperationalScope, Requirement } from "./dashboardAdvanced";
import { DashboardThresholdsPanel } from "./DashboardThresholdsPanel";
import { DashboardSectorCalendarsPanel } from "./DashboardSectorCalendarsPanel";
import { DashboardCalendarRetroPanel } from "./DashboardCalendarRetroPanel";
import { proposedEvolucaoWorkweek, verifiedSaoJose2026Observances } from "./dashboardOperationalPolicy";
import { effectiveCalendarEnd, previewGlobalSuccessor } from "./dashboardCalendarTimeline";
import {
  loadDashboardOperationalSettings, previewDashboardRuleImpact,
  publishDashboardCalendar, publishDashboardCalendarSuccessor, previewDashboardCalendarSuccessor,
  publishDashboardRule,
  type CalendarExceptionRecord, type CalendarPeriodRecord, type CalendarVersionRecord,
  type DashboardOperationalSettings, type OperationalRuleRecord, type RuleImpactPreview,
  type RuleRevisionRecord, type CalendarSuccessorImpactPreview,
} from "./dashboardOperationalSettingsRepository";

const SCOPES: Array<{ value: OperationalScope; label: string; description: string }> = [
  { value: "ART", label: "Arte", description: "Criação e preparação da arte." },
  { value: "APPROVAL", label: "Aprovação", description: "Aguardando aprovação do cliente." },
  { value: "PRODUCTION", label: "Produção", description: "Execução das operações de produção." },
  { value: "FINISHING", label: "Acabamento", description: "Acabamento e conferência." },
  { value: "INSTALLATION", label: "Instalação", description: "Serviços com instalação agendada." },
  { value: "LOGISTICS", label: "Logística", description: "Retirada, entrega ou transportadora." },
];

const WEEKDAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

type RuleDraft = {
  scope: OperationalScope;
  owner: Requirement | "";
  deadline: Requirement | "";
  conditionLogisticType: "instalacao" | "entrega" | "retirada" | "";
  stalledLimitMinutes: string;
  calendarVersionId: string;
  reason: string;
};

type PeriodDraft = { key: number; weekday: string; start: string; end: string };
type ExceptionDraft = {
  key: number; date: string; working: "" | "true" | "false";
  start: string; end: string; reason: string;
};

let draftKey = 1;

function formatDate(value: string | null) {
  if (!value) return "Sem data final";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? day + "/" + month + "/" + year : value;
}
function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : "—";
}
function weekdayLabel(value: number) {
  return WEEKDAYS.find(day => Number(day.value) === value)?.label ?? "Dia inválido";
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function scopeLabel(scope: string) {
  return SCOPES.find(row => row.value === scope)?.label ?? scope;
}
function ruleFingerprint(draft: RuleDraft) {
  return JSON.stringify([
    draft.scope, draft.owner, draft.deadline, draft.conditionLogisticType,
    draft.stalledLimitMinutes, draft.calendarVersionId,
  ]);
}

function SelectField({
  label, value, onChange, options, placeholder, disabled = false, id,
}: {
  label: string; value: string; onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>; placeholder: string;
  disabled?: boolean; id: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
        <option value="">{placeholder}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function RuleSummary({ rule }: { rule: OperationalRuleRecord | undefined }) {
  if (!rule) return <span className="text-sm text-muted-foreground">Ainda não configurada</span>;
  const requirementLabel = (value: Requirement) =>
    value === "required" ? "Obrigatório" : value === "optional" ? "Opcional" : "Condicional";
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>Responsável: <strong className="text-foreground">{requirementLabel(rule.owner)}</strong></p>
      <p>Prazo: <strong className="text-foreground">{requirementLabel(rule.deadline)}</strong></p>
      <p>Limite de permanência: <strong className="text-foreground">
        {rule.stalled_limit_minutes ? rule.stalled_limit_minutes + " min" : "Não configurado"}
      </strong></p>
      <p>Revisão publicada: <strong className="text-foreground">v{rule.revision}</strong></p>
    </div>
  );
}

function CalendarCard({
  calendar, periods, exceptions, versions,
}: {
  calendar: CalendarVersionRecord;
  periods: CalendarPeriodRecord[];
  exceptions: CalendarExceptionRecord[];
  versions: CalendarVersionRecord[];
}) {
  const effectiveUntilDerived = effectiveCalendarEnd(calendar, versions);
  const calendarPeriods = periods.filter(row => row.calendar_version_id === calendar.id);
  const calendarExceptions = exceptions.filter(row => row.calendar_version_id === calendar.id);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{calendar.name} · versão {calendar.version}</CardTitle>
            <CardDescription>
              Vigência efetiva: {formatDate(calendar.effective_from)} até {formatDate(effectiveUntilDerived)}
            </CardDescription>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">Publicada</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Fuso: {calendar.time_zone}</span>
          <span>Publicada em {formatDateTime(calendar.published_at)}</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            Ver jornada ({calendarPeriods.length} intervalos) e exceções ({calendarExceptions.length})
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 font-semibold">Jornada semanal</p>
              {calendarPeriods.length === 0
                ? <p className="text-xs text-muted-foreground">Nenhum intervalo encontrado.</p>
                : calendarPeriods.map(row => (
                  <p key={row.id} className="text-xs text-muted-foreground">
                    {weekdayLabel(row.weekday)} · {formatTime(row.starts_local)}–{formatTime(row.ends_local)}
                  </p>
                ))}
            </div>
            <div>
              <p className="mb-1 font-semibold">Exceções e datas especiais</p>
              {calendarExceptions.length === 0
                ? <p className="text-xs text-muted-foreground">Nenhuma exceção cadastrada nesta versão.</p>
                : calendarExceptions.map(row => (
                  <p key={row.id} className="text-xs text-muted-foreground">
                    {formatDate(row.exception_date)} · {row.working
                      ? "Jornada especial " + formatTime(row.starts_local) + "–" + formatTime(row.ends_local)
                      : "Sem expediente"} · {row.reason}
                  </p>
                ))}
            </div>
          </div>
        </details>
        <p className="border-t pt-2 text-xs text-muted-foreground">
          Justificativa: {calendar.publication_reason}
        </p>
        {!effectiveUntilDerived && (
          <p className="text-xs text-muted-foreground">
            Vigência aberta. Uma versão sucessora pode começar posteriormente, preservando este histórico.
          </p>
        )}
        {effectiveUntilDerived && calendar.effective_until !== effectiveUntilDerived && (
          <p className="text-xs text-muted-foreground">
            Versão substituída a partir do dia seguinte ao término efetivo indicado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardOperationalSettingsPage() {
  const { hubPermissions, hasModuleAccess } = useAuth();
  const allowed = hubPermissions.isManager && hasModuleAccess("hub_os");
  const [data, setData] = useState<DashboardOperationalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingScope, setEditingScope] = useState<OperationalScope | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [rulePreview, setRulePreview] = useState<{ fingerprint: string; result: RuleImpactPreview } | null>(null);
  const [previewingRule, setPreviewingRule] = useState(false);
  const [publishingRule, setPublishingRule] = useState(false);

  const [calendarName, setCalendarName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [calendarReason, setCalendarReason] = useState("");
  const [periods, setPeriods] = useState<PeriodDraft[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionDraft[]>([]);
  const [publishingCalendar, setPublishingCalendar] = useState(false);
  const [previewingCalendar, setPreviewingCalendar] = useState(false);
  const [calendarPreview, setCalendarPreview] = useState<{
    fingerprint: string; impact: CalendarSuccessorImpactPreview | null;
  } | null>(null);

  const proposeWorkweek = () => {
    if (periods.length && !window.confirm("Substituir todos os turnos digitados pela jornada aprovada?")) return;
    setPeriods(proposedEvolucaoWorkweek().map(period => ({
      key: draftKey++, weekday: String(period.weekday), start: period.start, end: period.end,
    })));
  };

  const propose2026Holidays = () => {
    if (!effectiveFrom) {
      toast.error("Defina a data de início da vigência antes de sugerir feriados.");
      return;
    }
    const legal = verifiedSaoJose2026Observances().filter(item => item.kind === "holiday" &&
      item.date >= effectiveFrom && (!effectiveUntil || item.date <= effectiveUntil));
    const previouslyAdded = new Set(exceptions.map(item => item.date));
    const suggested = legal.filter(item => !previouslyAdded.has(item.date)).map(item => ({
      key: draftKey++, date: item.date, working: "false" as const, start: "", end: "",
      reason: item.name + " (" + item.jurisdiction + "; fonte oficial 2026)",
    }));
    setExceptions(previous => [...previous, ...suggested].sort((a, b) => a.date.localeCompare(b.date)));
    toast.success(suggested.length
      ? suggested.length + " feriados sugeridos para conferência. Nada foi publicado."
      : "Nenhum feriado novo de 2026 dentro da vigência informada.");
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setData(await loadDashboardOperationalSettings());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao consultar configurações operacionais.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  const latestCalendar = data?.calendars[0] ?? null;
  const selectedRule = editingScope
    ? data?.rules.find(rule => rule.scope === editingScope) ?? null
    : null;
  const selectedHistory = selectedRule
    ? data?.revisions.filter(row => row.rule_id === selectedRule.id) ?? []
    : [];

  const openRuleEditor = (scope: OperationalScope) => {
    const existing = data?.rules.find(rule => rule.scope === scope);
    setEditingScope(scope);
    setRulePreview(null);
    setRuleDraft({
      scope,
      owner: existing?.owner ?? (scope === "APPROVAL" || scope === "LOGISTICS" ? "optional" : ""),
      deadline: existing?.deadline ?? (scope === "LOGISTICS" ? "optional" : ""),
      conditionLogisticType: existing?.condition_logistic_type ?? "",
      stalledLimitMinutes: existing?.stalled_limit_minutes == null ? "" : String(existing.stalled_limit_minutes),
      calendarVersionId: existing?.calendar_version_id ?? "",
      reason: "",
    });
  };

  const updateRuleDraft = (patch: Partial<RuleDraft>) => {
    setRuleDraft(current => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (next.owner !== "conditional" && next.deadline !== "conditional")
        next.conditionLogisticType = "";
      return next;
    });
    setRulePreview(null);
  };

  const ruleConditionNeeded = Boolean(ruleDraft &&
    (ruleDraft.owner === "conditional" || ruleDraft.deadline === "conditional"));
  const currentRuleFingerprint = ruleDraft ? ruleFingerprint(ruleDraft) : "";
  const ruleCanPreview = Boolean(ruleDraft && ruleDraft.owner && ruleDraft.deadline &&
    (!ruleConditionNeeded || ruleDraft.conditionLogisticType) &&
    (ruleDraft.stalledLimitMinutes.trim() === "" ||
      (Number.isSafeInteger(Number(ruleDraft.stalledLimitMinutes)) &&
        Number(ruleDraft.stalledLimitMinutes) > 0 && Boolean(ruleDraft.calendarVersionId))));
  const rulePreviewIsCurrent = Boolean(rulePreview && rulePreview.fingerprint === currentRuleFingerprint);
  const ruleCanPublish = Boolean(ruleDraft && rulePreviewIsCurrent && ruleDraft.reason.trim().length >= 3);

  const runRulePreview = async () => {
    if (!ruleDraft || !ruleCanPreview) return;
    setPreviewingRule(true);
    setRulePreview(null);
    try {
      const result = await previewDashboardRuleImpact({
        scope: ruleDraft.scope,
        owner: ruleDraft.owner as Requirement,
        deadline: ruleDraft.deadline as Requirement,
        conditionLogisticType: ruleConditionNeeded ? ruleDraft.conditionLogisticType as "instalacao" | "entrega" | "retirada" : null,
        stalledLimitMinutes: ruleDraft.stalledLimitMinutes.trim() ? Number(ruleDraft.stalledLimitMinutes) : null,
        calendarVersionId: ruleDraft.calendarVersionId || null,
      });
      setRulePreview({ fingerprint: ruleFingerprint(ruleDraft), result });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível calcular a prévia.");
    } finally {
      setPreviewingRule(false);
    }
  };

  const saveRule = async () => {
    if (!ruleDraft || !ruleCanPublish) return;
    setPublishingRule(true);
    try {
      await publishDashboardRule({
        scope: ruleDraft.scope,
        owner: ruleDraft.owner as Requirement,
        deadline: ruleDraft.deadline as Requirement,
        conditionLogisticType: ruleConditionNeeded ? ruleDraft.conditionLogisticType as "instalacao" | "entrega" | "retirada" : null,
        stalledLimitMinutes: ruleDraft.stalledLimitMinutes.trim() ? Number(ruleDraft.stalledLimitMinutes) : null,
        calendarVersionId: ruleDraft.calendarVersionId || null,
        expectedRevision: selectedRule?.revision ?? 0,
        reason: ruleDraft.reason.trim(),
      });
      toast.success("Regra publicada e registrada no histórico.");
      setEditingScope(null);
      setRuleDraft(null);
      setRulePreview(null);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar a regra.");
    } finally {
      setPublishingRule(false);
    }
  };

  const calendarFingerprint = JSON.stringify([
    calendarName, effectiveFrom, effectiveUntil, calendarReason,
    periods, exceptions, latestCalendar?.version ?? 0,
  ]);
  const calendarPreviewIsCurrent = Boolean(
    calendarPreview && calendarPreview.fingerprint === calendarFingerprint,
  );

  const calendarValidation = useMemo(() => {
    if (!calendarName.trim()) return "Informe o nome do calendário.";
    if (!effectiveFrom) return "Informe a data inicial da vigência.";
    if (effectiveUntil && effectiveUntil < effectiveFrom) return "A data final não pode anteceder a data inicial.";
    if (calendarReason.trim().length < 3) return "Informe uma justificativa com pelo menos 3 caracteres.";
    if (periods.length < 1 || periods.length > 28) return "Cadastre de 1 a 28 intervalos semanais.";
    for (const row of periods) {
      if (row.weekday === "" || !row.start || !row.end) return "Complete dia, início e fim de cada intervalo semanal.";
      if (row.end <= row.start) return "O fim de cada intervalo precisa ser posterior ao início.";
    }
    for (const day of WEEKDAYS) {
      const dayPeriods = periods.filter(row => row.weekday === day.value).sort((a,b) => a.start.localeCompare(b.start));
      for (let index = 1; index < dayPeriods.length; index++) {
        if (dayPeriods[index].start < dayPeriods[index - 1].end)
          return "Existem intervalos sobrepostos em " + day.label + ".";
      }
    }
    const exceptionDates = new Set<string>();
    for (const row of exceptions) {
      if (!row.date || !row.working || row.reason.trim().length < 1)
        return "Complete data, tipo e justificativa de cada exceção.";
      if (row.date < effectiveFrom || (effectiveUntil && row.date > effectiveUntil))
        return "As exceções precisam estar dentro da vigência do calendário.";
      if (exceptionDates.has(row.date)) return "Existe mais de uma exceção para a mesma data.";
      exceptionDates.add(row.date);
      if (row.working === "true" && (!row.start || !row.end || row.end <= row.start))
        return "Jornadas especiais precisam de início e fim válidos.";
    }
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    if (effectiveFrom < today)
      return "Alterações retroativas exigem solicitação e autorização específicas.";
    const succession = previewGlobalSuccessor(data?.calendars ?? [], effectiveFrom);
    if (succession.state === "invalid") return succession.reason;
    return "";
  }, [calendarName, effectiveFrom, effectiveUntil, calendarReason, periods, exceptions, data?.calendars]);

  const previewCalendar = async () => {
    if (calendarValidation) return;
    setPreviewingCalendar(true);
    try {
      const impact = latestCalendar
        ? await previewDashboardCalendarSuccessor({
            effectiveFrom, expectedLastVersion: latestCalendar.version,
          })
        : null;
      setCalendarPreview({ fingerprint: calendarFingerprint, impact });
    } catch (error) {
      setCalendarPreview(null);
      toast.error(error instanceof Error ? error.message : "Falha na prévia da nova vigência.");
    } finally {
      setPreviewingCalendar(false);
    }
  };

  const saveCalendar = async () => {
    if (calendarValidation || !calendarPreviewIsCurrent) return;
    if (!window.confirm("Publicar esta nova versão do calendário geral? As versões anteriores serão preservadas.")) return;
    setPublishingCalendar(true);
    try {
      const dataToPublish = {
        name: calendarName.trim(),
        effectiveFrom,
        effectiveUntil: effectiveUntil || null,
        periods: periods.map(row => ({
          weekday: Number(row.weekday), start: row.start, end: row.end,
        })),
        exceptions: exceptions.map(row => ({
          date: row.date,
          working: row.working === "true",
          start: row.working === "true" ? row.start : null,
          end: row.working === "true" ? row.end : null,
          reason: row.reason.trim(),
        })),
        expectedLastVersion: latestCalendar?.version ?? 0,
        reason: calendarReason.trim(),
      };
      if (latestCalendar) await publishDashboardCalendarSuccessor(dataToPublish);
      else await publishDashboardCalendar(dataToPublish);
      toast.success("Nova versão do calendário publicada com histórico preservado.");
      setCalendarPreview(null);
      setCalendarName("");
      setEffectiveFrom("");
      setEffectiveUntil("");
      setCalendarReason("");
      setPeriods([]);
      setExceptions([]);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar o calendário.");
    } finally {
      setPublishingCalendar(false);
    }
  };

  if (!allowed) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Regras Operacionais</h1>
        <p className="text-sm text-muted-foreground">Somente gestores com acesso ao Hub OS podem alterar estas configurações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-semibold tracking-tight">Regras Operacionais</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Configure exigências e jornada de trabalho com histórico. Nada é presumido: somente regras e horários publicados geram alertas ou cálculos.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Atualizar
        </Button>
      </div>

      {loadError && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{loadError}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Consultando regras, calendários e histórico…</p>}

      {data && (
        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:w-[800px] sm:grid-cols-4">
            <TabsTrigger value="rules">Regras por etapa</TabsTrigger>
            <TabsTrigger value="calendar">Jornada e exceções</TabsTrigger>
            <TabsTrigger value="thresholds">Atenção / Crítico</TabsTrigger>
            <TabsTrigger value="sector">Por setor</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Exigências por etapa</CardTitle>
                <CardDescription>
                  Obrigatório, opcional ou condicional. A prévia consulta as OS atuais antes de cada publicação.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {SCOPES.map(scope => {
                  const rule = data.rules.find(row => row.scope === scope.value);
                  return (
                    <div key={scope.value} className="rounded-xl border p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{scope.label}</h3>
                          <p className="text-xs text-muted-foreground">{scope.description}</p>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-[11px]">
                          {rule ? "Configurada" : "Pendente"}
                        </span>
                      </div>
                      <RuleSummary rule={rule} />
                      <Button type="button" variant="outline" className="mt-3 w-full"
                        onClick={() => openRuleEditor(scope.value)}>
                        {rule ? "Revisar regra" : "Configurar regra"}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {ruleDraft && editingScope && (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle>{selectedRule ? "Revisar regra" : "Configurar regra"} · {scopeLabel(editingScope)}</CardTitle>
                      <CardDescription>
                        A publicação cria uma nova revisão. A versão anterior permanece no histórico.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      setEditingScope(null); setRuleDraft(null); setRulePreview(null);
                    }}>Fechar</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField id="dashboard-rule-owner" label="Responsável" value={ruleDraft.owner}
                      onChange={value => updateRuleDraft({ owner: value as Requirement | "" })}
                      disabled={editingScope === "APPROVAL" || editingScope === "LOGISTICS"}
                      placeholder="Selecione a exigência"
                      options={[
                        { value: "required", label: "Obrigatório" },
                        { value: "optional", label: "Opcional" },
                        { value: "conditional", label: "Condicional" },
                      ]} />
                    <SelectField id="dashboard-rule-deadline" label="Prazo" value={ruleDraft.deadline}
                      onChange={value => updateRuleDraft({ deadline: value as Requirement | "" })}
                      disabled={editingScope === "LOGISTICS"}
                      placeholder="Selecione a exigência"
                      options={[
                        { value: "required", label: "Obrigatório" },
                        { value: "optional", label: "Opcional" },
                        { value: "conditional", label: "Condicional" },
                      ]} />
                  </div>
                  {(editingScope === "APPROVAL" || editingScope === "LOGISTICS") && (
                    <p className="text-xs text-muted-foreground">
                      {editingScope === "APPROVAL"
                        ? "A aprovação não possui fonte própria de responsável; por isso, essa exigência fica opcional."
                        : "A logística ainda não possui fonte própria de responsável e prazo; ambas as exigências ficam opcionais."}
                    </p>
                  )}
                  {ruleConditionNeeded && (
                    <SelectField id="dashboard-rule-condition" label="Aplicar quando o tipo logístico for"
                      value={ruleDraft.conditionLogisticType}
                      onChange={value => updateRuleDraft({ conditionLogisticType: value as RuleDraft["conditionLogisticType"] })}
                      placeholder="Selecione a condição"
                      options={[
                        { value: "retirada", label: "Retirada" },
                        { value: "entrega", label: "Entrega" },
                        { value: "instalacao", label: "Instalação" },
                      ]} />
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Limite de permanência (minutos)</span>
                      <Input type="number" min="1" step="1" value={ruleDraft.stalledLimitMinutes}
                        onChange={event => updateRuleDraft({ stalledLimitMinutes: event.target.value })}
                        placeholder="Não configurar limite" />
                      <span className="text-xs text-muted-foreground">Opcional. Só será validado com calendário publicado.</span>
                    </label>
                    <SelectField id="dashboard-rule-calendar" label="Calendário usado no cálculo"
                      value={ruleDraft.calendarVersionId}
                      onChange={value => updateRuleDraft({ calendarVersionId: value })}
                      placeholder="Sem calendário associado"
                      options={data.calendars.map(calendar => ({
                        value: calendar.id, label: "v" + calendar.version + " · " + calendar.name,
                      }))} />
                  </div>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Justificativa da publicação</span>
                    <Input value={ruleDraft.reason} maxLength={1000}
                      onChange={event => updateRuleDraft({ reason: event.target.value })}
                      placeholder="Explique por que esta regra está sendo criada ou alterada" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void runRulePreview()}
                      disabled={!ruleCanPreview || previewingRule || publishingRule}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {previewingRule ? "Calculando prévia…" : "Prévia de impacto"}
                    </Button>
                    <Button type="button" onClick={() => void saveRule()}
                      disabled={!ruleCanPublish || publishingRule || previewingRule}>
                      <Save className="mr-2 h-4 w-4" />
                      {publishingRule ? "Publicando…" : "Publicar regra"}
                    </Button>
                  </div>
                  {rulePreviewIsCurrent && rulePreview && (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <p className="mb-2 font-semibold">Prévia das OS afetadas neste momento</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <p><strong className="block text-xl tabular-nums">{rulePreview.result.os_consultadas}</strong><span className="text-xs text-muted-foreground">OS consultadas</span></p>
                        <p><strong className="block text-xl tabular-nums">{rulePreview.result.sem_responsavel}</strong><span className="text-xs text-muted-foreground">Sem responsável exigido</span></p>
                        <p><strong className="block text-xl tabular-nums">{rulePreview.result.sem_prazo}</strong><span className="text-xs text-muted-foreground">Sem prazo exigido</span></p>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{rulePreview.result.observacao} Duração verificada: não.</p>
                    </div>
                  )}
                  {selectedRule && selectedHistory.length > 0 && (
                    <div className="border-t pt-3">
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4" /> Histórico desta regra
                      </h3>
                      <div className="space-y-2">
                        {selectedHistory.map((revision: RuleRevisionRecord) => (
                          <div key={revision.id} className="rounded-lg border p-3 text-xs">
                            <div className="flex flex-wrap justify-between gap-2">
                              <strong>Revisão {revision.revision}</strong>
                              <span className="text-muted-foreground">{formatDateTime(revision.changed_at)}</span>
                            </div>
                            <p className="mt-1 text-muted-foreground">{revision.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="thresholds" className="space-y-4">
            <DashboardThresholdsPanel calendars={data.calendars} />
          </TabsContent>

          <TabsContent value="sector" className="space-y-4">
            <DashboardSectorCalendarsPanel
              calendars={data.calendars} periods={data.periods} exceptions={data.exceptions} />
          </TabsContent>

          <TabsContent value="calendar" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Publicar jornada de trabalho</CardTitle>
                <CardDescription>
                  Informe os dias e horários reais. Não há jornada padrão preenchida; cada versão publicada é imutável.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Nome do calendário</span>
                    <Input value={calendarName} onChange={event => setCalendarName(event.target.value)}
                      maxLength={140} placeholder="Ex.: Jornada operacional" />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Início da vigência</span>
                    <Input type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Fim da vigência (opcional)</span>
                    <Input type="date" value={effectiveUntil} min={effectiveFrom || undefined}
                      onChange={event => setEffectiveUntil(event.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Justificativa</span>
                    <Input value={calendarReason} onChange={event => setCalendarReason(event.target.value)}
                      maxLength={1000} placeholder="Motivo da publicação desta jornada" />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Jornada semanal</h3>
                      <p className="text-xs text-muted-foreground">Adicione um intervalo por dia e turno. Não é necessário cadastrar dias sem expediente.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPeriods(current => [
                      ...current, { key: draftKey++, weekday: "", start: "", end: "" },
                    ])} disabled={periods.length >= 28}>
                      <Plus className="mr-1 h-4 w-4" /> Adicionar horário
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={proposeWorkweek}>
                      Sugerir jornada aprovada (44h)
                    </Button>
                  </div>
                  {periods.length === 0 && (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum horário cadastrado. Adicione os intervalos que correspondem à jornada real da empresa.
                    </p>
                  )}
                  {periods.map((row, index) => (
                    <div key={row.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-end">
                      <SelectField id={"calendar-weekday-" + row.key} label="Dia da semana" value={row.weekday}
                        onChange={value => setPeriods(current => current.map(item => item.key === row.key ? { ...item, weekday: value } : item))}
                        placeholder="Selecione o dia" options={WEEKDAYS} />
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Início</span>
                        <Input type="time" value={row.start}
                          onChange={event => setPeriods(current => current.map(item => item.key === row.key ? { ...item, start: event.target.value } : item))} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Fim</span>
                        <Input type="time" value={row.end}
                          onChange={event => setPeriods(current => current.map(item => item.key === row.key ? { ...item, end: event.target.value } : item))} />
                      </label>
                      <Button type="button" variant="ghost" size="icon" aria-label={"Remover horário " + (index + 1)}
                        onClick={() => setPeriods(current => current.filter(item => item.key !== row.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Feriados e exceções</h3>
                      <p className="text-xs text-muted-foreground">
                        Cadastre datas sem expediente ou com jornada especial. Sugestões de feriados são válidas
                        apenas para 2026; pontos facultativos permanecem dias normais sem exceção explícita.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setExceptions(current => [
                      ...current, { key: draftKey++, date: "", working: "", start: "", end: "", reason: "" },
                    ])} disabled={exceptions.length >= 3660}>
                      <Plus className="mr-1 h-4 w-4" /> Adicionar exceção
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={propose2026Holidays}>
                      Sugerir feriados oficiais 2026
                    </Button>
                  </div>
                  {exceptions.map((row, index) => (
                    <div key={row.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto] xl:items-end">
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Data</span>
                        <Input type="date" value={row.date}
                          onChange={event => setExceptions(current => current.map(item => item.key === row.key ? { ...item, date: event.target.value } : item))} />
                      </label>
                      <SelectField id={"calendar-exception-working-" + row.key} label="Tipo" value={row.working}
                        onChange={value => setExceptions(current => current.map(item => item.key === row.key ? { ...item, working: value as ExceptionDraft["working"] } : item))}
                        placeholder="Selecione" options={[
                          { value: "false", label: "Sem expediente" },
                          { value: "true", label: "Jornada especial" },
                        ]} />
                      {row.working === "true" && <>
                        <label className="grid gap-1.5 text-sm">
                          <span className="font-medium">Início</span>
                          <Input type="time" value={row.start}
                            onChange={event => setExceptions(current => current.map(item => item.key === row.key ? { ...item, start: event.target.value } : item))} />
                        </label>
                        <label className="grid gap-1.5 text-sm">
                          <span className="font-medium">Fim</span>
                          <Input type="time" value={row.end}
                            onChange={event => setExceptions(current => current.map(item => item.key === row.key ? { ...item, end: event.target.value } : item))} />
                        </label>
                      </>}
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Motivo</span>
                        <Input value={row.reason} maxLength={500}
                          onChange={event => setExceptions(current => current.map(item => item.key === row.key ? { ...item, reason: event.target.value } : item))}
                          placeholder="Feriado, recesso, jornada especial…" />
                      </label>
                      <Button type="button" variant="ghost" size="icon" aria-label={"Remover exceção " + (index + 1)}
                        onClick={() => setExceptions(current => current.filter(item => item.key !== row.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {exceptions.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma exceção será cadastrada nesta versão.</p>}
                </div>

                {calendarValidation && (
                  <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
                    {calendarValidation}
                  </p>
                )}
                {!calendarValidation && !effectiveUntil && (
                  <p className="text-xs text-muted-foreground">
                    Sem data final: esta versão permanecerá aberta até uma versão sucessora publicada. Histórico anterior imutável.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Fuso horário fixo: America/Sao_Paulo · Próxima versão: v{(latestCalendar?.version ?? 0) + 1}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void previewCalendar()}
                      disabled={Boolean(calendarValidation) || previewingCalendar || publishingCalendar || loading}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {previewingCalendar ? "Consultando…" : "Prévia de vigência"}
                    </Button>
                    <Button type="button" onClick={() => void saveCalendar()}
                      disabled={Boolean(calendarValidation) || !calendarPreviewIsCurrent ||
                        previewingCalendar || publishingCalendar || loading}>
                      <Save className="mr-2 h-4 w-4" />
                      {publishingCalendar ? "Publicando…" : "Publicar calendário"}
                    </Button>
                  </div>
                </div>
                {calendarPreviewIsCurrent && calendarPreview && (
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="font-semibold">Prévia consultiva — não altera dados</p>
                    <p>A nova vigência começa em {formatDate(effectiveFrom)}.</p>
                    {calendarPreview.impact ? (
                      <>
                        <p>{calendarPreview.impact.open_stage_intervals} intervalos atualmente abertos
                          vinculados à versão anterior.</p>
                        <p>{calendarPreview.impact.rules_still_linked_to_previous} regras continuam vinculadas
                          à versão anterior e precisarão de revisão gerencial.</p>
                        <p className="text-amber-700 dark:text-amber-300">
                          Esta prévia não comprova diferenças de horas nem mudança de criticidade.
                          A simulação completa depende de evidências temporais verificadas.
                        </p>
                      </>
                    ) : <p>Primeira versão: sem calendário anterior a substituir.</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Histórico de calendários</h2>
                <p className="text-sm text-muted-foreground">As versões publicadas são somente leitura.</p>
              </div>
              {data.calendars.length === 0
                ? <Card><CardContent className="p-5 text-sm text-muted-foreground">
                    Nenhum calendário publicado. A jornada ainda não foi presumida nem cadastrada.
                  </CardContent></Card>
                : data.calendars.map(calendar => (
                  <CalendarCard key={calendar.id} calendar={calendar}
                    periods={data.periods} exceptions={data.exceptions}
                    versions={data.calendars} />
                ))}
            </div>
            <DashboardCalendarRetroPanel calendars={data.calendars} />
          </TabsContent>
        </Tabs>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Publicar uma regra ou calendário não altera OS, prazos ou status existentes. Cálculos por duração só serão ativados quando houver histórico confiável de entrada, saída e pausas.
      </p>
    </div>
  );
}
