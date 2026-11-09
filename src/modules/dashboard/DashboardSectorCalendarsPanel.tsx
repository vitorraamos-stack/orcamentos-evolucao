import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, History, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CalendarVersionRecord, CalendarPeriodRecord, CalendarExceptionRecord,
} from "./dashboardOperationalSettingsRepository";
import { proposedEvolucaoWorkweek, type OperationalScope, type WorkWindow } from "./dashboardOperationalPolicy";
import {
  resolveSectorCalendarDay, validateSectorCalendarDraft, type SectorCalendarDraft,
  type SectorCalendarRevision,
} from "./dashboardSectorCalendar";
import { loadSectorCalendarRevisions, publishSectorCalendar } from "./dashboardSectorCalendarRepository";

const SCOPES: Array<{ scope: OperationalScope; name: string }> = [
  { scope: "ART", name: "Arte" },
  { scope: "APPROVAL", name: "Aprovação" },
  { scope: "PRODUCTION", name: "Produção" },
  { scope: "FINISHING", name: "Finalização" },
  { scope: "INSTALLATION", name: "Instalação" },
  { scope: "LOGISTICS", name: "Logística" },
];
const WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type PreviewLine = { date: string; source: string; windows: WorkWindow[]; reason: string };

function dateNext(iso: string, offset: number): string {
  const epoch = Date.parse(iso + "T12:00:00Z");
  return new Date(epoch + offset * 86_400_000).toISOString().slice(0, 10);
}
function labelScope(scope: OperationalScope): string {
  return SCOPES.find(item => item.scope === scope)?.name ?? scope;
}
function labelWindows(windows: readonly WorkWindow[]): string {
  return windows.length ? windows.map(row => row.start + "–" + row.end).join(" · ") : "Sem expediente";
}

/**
 * Separate from global calendar publication. This component is available only
 * inside the existing manager-gated Settings page; SQL RPC rechecks auth.
 */
export function DashboardSectorCalendarsPanel({ calendars, periods, exceptions }: {
  calendars: CalendarVersionRecord[];
  periods: CalendarPeriodRecord[];
  exceptions: CalendarExceptionRecord[];
}) {
  const [history, setHistory] = useState<SectorCalendarRevision[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SectorCalendarDraft | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ fingerprint: string; lines: PreviewLine[] } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await loadSectorCalendarRevisions();
      setHistory(result.revisions);
      setAvailable(result.state === "available");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar calendários por setor.");
      setAvailable(false);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const selection = calendars.find(row => row.id === draft?.baseCalendarVersionId);
  const previous = draft ? history.filter(row =>
    row.scope === draft.scope && row.base_calendar_version_id === draft.baseCalendarVersionId
  ).sort((a,b) => b.revision - a.revision)[0] : undefined;
  const validation = draft ? validateSectorCalendarDraft(draft) : null;
  const extraError = draft && selection
    ? draft.effectiveFrom < selection.effective_from ||
      (selection.effective_until !== null && (
        draft.effectiveFrom > selection.effective_until ||
        !draft.effectiveUntil || draft.effectiveUntil > selection.effective_until
      ))
      ? "A vigência precisa estar contida no calendário padrão."
      : previous && draft.effectiveFrom <= previous.effective_from
        ? "A próxima revisão deve iniciar depois da vigente. Correções retroativas exigem fluxo específico."
        : null
    : draft ? "Selecione um calendário padrão publicado." : null;
  const noError = Boolean(available && draft && !validation && !extraError);
  const fingerprint = useMemo(() => draft ? JSON.stringify(draft) : "", [draft]);
  const previewIsCurrent = Boolean(preview && preview.fingerprint === fingerprint);
  const canPublish = Boolean(noError && previewIsCurrent && reason.trim().length >= 3 &&
    !publishing && !loading);

  const update = (patch: Partial<SectorCalendarDraft>) => {
    setDraft(current => current ? { ...current, ...patch } : null);
    setPreview(null);
  };

  const startDraft = () => {
    const active = calendars[0];
    setDraft({
      scope: "PRODUCTION",
      baseCalendarVersionId: active?.id ?? "",
      effectiveFrom: "", effectiveUntil: null, mode: "inherit", periods: [], exceptions: [],
    });
    setReason(""); setPreview(null);
  };

  const makePreview = () => {
    if (!draft || !selection || !noError) return;
    const baseWeek = periods.filter(row => row.calendar_version_id === selection.id)
      .map(row => ({ weekday: row.weekday, start: row.starts_local.slice(0,5), end: row.ends_local.slice(0,5) }));
    const allDates = new Set<string>([
      ...Array.from({ length: 7 }, (_,index) => dateNext(draft.effectiveFrom, index)),
      ...draft.exceptions.map(row => row.date),
    ]);
    const synthetic: SectorCalendarRevision = {
      id: "PREVIEW-ONLY", scope: draft.scope,
      base_calendar_version_id: selection.id,
      revision: (previous?.revision ?? 0) + 1,
      effective_from: draft.effectiveFrom, effective_until: draft.effectiveUntil,
      mode: draft.mode, periods: draft.periods, exceptions: draft.exceptions,
      published_by: "PREVIEW-ONLY", published_at: "", reason: "Prévia não publicada",
    };
    const lines: PreviewLine[] = [];
    for (const date of [...allDates].sort().slice(0, 14)) {
      if (date < draft.effectiveFrom || (draft.effectiveUntil && date > draft.effectiveUntil)) continue;
      const base = exceptions.find(row => row.calendar_version_id === selection.id && row.exception_date === date);
      const resolved = resolveSectorCalendarDay({
        date, scope: draft.scope, baseCalendarId: selection.id,
        baseWeek, baseException: base
          ? { windows: base.working && base.starts_local && base.ends_local
              ? [{ start: base.starts_local.slice(0,5), end: base.ends_local.slice(0,5) }]
              : [], reason: base.reason }
          : null,
        sectorRevisions: [...history, synthetic],
      });
      if (resolved.state !== "available") {
        toast.error("Prévia interrompida: " + resolved.reason);
        setPreview(null);
        return;
      }
      lines.push({ date, source: resolved.source, windows: resolved.windows, reason: resolved.reason });
    }
    setPreview({ fingerprint, lines });
  };

  const save = async () => {
    if (!draft || !canPublish) return;
    if (!window.confirm("Publicar a nova versão do calendário de " + labelScope(draft.scope) +
      "? A vigência será aplicada somente após a confirmação.")) return;
    setPublishing(true);
    try {
      await publishSectorCalendar({ ...draft, reason: reason.trim(), expectedRevision: previous?.revision ?? 0 });
      toast.success("Calendário setorial publicado com histórico imutável.");
      setDraft(null); setPreview(null);
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao publicar calendário.");
    } finally { setPublishing(false); }
  };

  return (
    <section className="space-y-4" aria-label="Calendários por setor">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              Calendários por setor
            </CardTitle>
            <CardDescription>
              Todos herdam o calendário geral. Jornadas próprias e exceções exigem publicação pela gestão,
              com vigência e revisões preservadas.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={loading} onClick={() => void reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />Atualizar
            </Button>
            <Button disabled={!available || !calendars.length || loading} onClick={startDraft}>
              <Plus className="mr-2 h-4 w-4" />Nova revisão
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p role="status" className="text-sm">Consultando versões setoriais…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!loading && !available && !error && (
            <p role="status" className="rounded-md border p-3 text-sm text-amber-700 dark:text-amber-300">
              Migration de calendários setoriais ainda não aplicada. A configuração permanece indisponível,
              preservando o calendário já publicado e os registros históricos.
            </p>
          )}
          {available && !history.length &&
            <p className="text-sm text-muted-foreground">Nenhuma revisão setorial publicada. Todos os setores seguem a jornada padrão.</p>}
          {history.length > 0 && SCOPES.map(({ scope, name }) => {
            const snapshots = history.filter(row => row.scope === scope)
              .sort((a,b) => b.effective_from.localeCompare(a.effective_from));
            return snapshots.length ? (
              <details key={scope} className="rounded-lg border p-3">
                <summary className="cursor-pointer font-semibold">
                  {name} · {snapshots.length} revisão(ões) registrada(s)
                </summary>
                <div className="mt-3 space-y-2">
                  {snapshots.map(row => (
                    <div key={row.id} className="rounded-md bg-muted/30 p-2 text-sm">
                      <p><strong>v{row.revision}</strong> · vigência desde {row.effective_from}
                        {row.effective_until ? " até " + row.effective_until : " (sem data final)"}</p>
                      <p>{row.mode === "inherit" ? "Jornada padrão" : "Jornada específica"}
                        {" · "}{row.periods.length} turno(s) · {row.exceptions.length} exceção(ões)</p>
                      <p className="text-muted-foreground">{row.reason}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null;
          })}
        </CardContent>
      </Card>

      {draft && available && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicar calendário setorial</CardTitle>
            <CardDescription>
              Uma revisão posterior substitui a anterior a partir da vigência informada.
              Nenhum horário ou feriado é publicado automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Setor
                <select className="h-10 rounded-md border bg-background px-3" value={draft.scope}
                  onChange={e => update({ scope: e.target.value as OperationalScope })}>
                  {SCOPES.map(row => <option key={row.scope} value={row.scope}>{row.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Calendário padrão publicado
                <select className="h-10 rounded-md border bg-background px-3"
                  value={draft.baseCalendarVersionId}
                  onChange={e => update({ baseCalendarVersionId: e.target.value })}>
                  <option value="">Selecione</option>
                  {calendars.map(row => <option value={row.id} key={row.id}>
                    v{row.version} · {row.name}
                  </option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Início da vigência
                <Input type="date" value={draft.effectiveFrom}
                  onChange={e => update({ effectiveFrom: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Fim da vigência (opcional)
                <Input type="date" value={draft.effectiveUntil ?? ""}
                  min={draft.effectiveFrom || undefined}
                  onChange={e => update({ effectiveUntil: e.target.value || null })} />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">Tratamento da jornada
                <select className="h-10 rounded-md border bg-background px-3"
                  value={draft.mode} onChange={e => update({
                    mode: e.target.value as "inherit" | "override",
                    periods: e.target.value === "inherit" ? [] : proposedEvolucaoWorkweek(),
                  })}>
                  <option value="inherit">Herdar jornada padrão</option>
                  <option value="override">Utilizar jornada específica por setor</option>
                </select>
              </label>
            </div>

            {draft.mode === "override" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Turnos do setor</h4>
                  <Button variant="outline" size="sm" type="button"
                    disabled={draft.periods.length >= 28}
                    onClick={() => update({ periods: [...draft.periods, {
                      weekday: 1, start: "08:00", end: "12:00",
                    }] })}><Plus className="mr-1 h-4 w-4"/>Adicionar turno</Button>
                </div>
                {draft.periods.map((row,index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                    <label className="grid flex-1 gap-1 text-xs">Dia
                      <select className="h-10 rounded-md border bg-background px-2"
                        value={row.weekday} onChange={e => update({ periods: draft.periods.map((p,i) =>
                          i===index ? { ...p, weekday: Number(e.target.value) } : p) })}>
                        {WEEK.map((d,day) => <option key={day} value={day}>{d}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs">Início
                      <Input type="time" value={row.start} onChange={e => update({ periods: draft.periods.map((p,i) =>
                        i===index ? { ...p, start: e.target.value } : p) })} />
                    </label>
                    <label className="grid gap-1 text-xs">Fim
                      <Input type="time" value={row.end} onChange={e => update({ periods: draft.periods.map((p,i) =>
                        i===index ? { ...p, end: e.target.value } : p) })} />
                    </label>
                    <Button variant="ghost" type="button" size="icon" aria-label={"Remover turno "+(index+1)}
                      onClick={() => update({ periods: draft.periods.filter((_,i)=>i!==index) })}>
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">Exceções setoriais autorizadas</h4>
                  <p className="text-xs text-muted-foreground">
                    Um dia sem turnos representa folga integral. Adicione turnos para expediente especial,
                    inclusive horário extraordinário autorizado pela gestão.
                  </p>
                </div>
                <Button variant="outline" size="sm" type="button"
                  disabled={draft.exceptions.length >= 3660}
                  onClick={() => update({ exceptions: [...draft.exceptions, {
                    date: "", windows: [], reason: "",
                  }] })}><Plus className="mr-1 h-4 w-4" />Adicionar exceção</Button>
              </div>
              {draft.exceptions.map((entry,index) => (
                <div key={index} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-xs">Data
                      <Input type="date" value={entry.date} onChange={e => update({
                        exceptions: draft.exceptions.map((row,i) =>
                          i===index ? { ...row,date:e.target.value } : row),
                      })}/>
                    </label>
                    <label className="grid min-w-[180px] flex-1 gap-1 text-xs">Justificativa
                      <Input maxLength={500} value={entry.reason} onChange={e => update({
                        exceptions: draft.exceptions.map((row,i) =>
                          i===index ? { ...row,reason:e.target.value } : row),
                      })}/>
                    </label>
                    <Button variant="ghost" size="icon" type="button"
                      aria-label={"Remover exceção "+(index+1)}
                      onClick={() => update({ exceptions: draft.exceptions.filter((_,i)=>i!==index) })}>
                      <Trash2 className="h-4 w-4"/>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.windows.length ? "Horários especiais" : "Sem expediente"}
                  </p>
                  {entry.windows.map((windowItem,wIndex) => (
                    <div className="flex items-end gap-2" key={wIndex}>
                      <label className="grid gap-1 text-xs">Início
                        <Input type="time" value={windowItem.start} onChange={e => update({
                          exceptions: draft.exceptions.map((row,i) => i===index
                            ? { ...row, windows: row.windows.map((w,j)=>j===wIndex
                              ? { ...w,start:e.target.value } : w) } : row),
                        })}/>
                      </label>
                      <label className="grid gap-1 text-xs">Fim
                        <Input type="time" value={windowItem.end} onChange={e => update({
                          exceptions: draft.exceptions.map((row,i) => i===index
                            ? { ...row, windows: row.windows.map((w,j)=>j===wIndex
                              ? { ...w,end:e.target.value } : w) } : row),
                        })}/>
                      </label>
                      <Button type="button" size="icon" variant="ghost"
                        aria-label={"Remover turno especial "+(wIndex+1)}
                        onClick={() => update({ exceptions: draft.exceptions.map((row,i) => i===index
                          ? { ...row,windows:row.windows.filter((_,j)=>j!==wIndex) } : row) })}>
                        <Trash2 className="h-4 w-4"/>
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" type="button"
                    disabled={entry.windows.length >= 6}
                    onClick={() => update({ exceptions: draft.exceptions.map((row,i) => i===index
                      ? { ...row,windows:[...row.windows,{start:"08:00",end:"12:00"}] } : row) })}>
                    <Plus className="mr-1 h-4 w-4"/>Adicionar turno especial
                  </Button>
                </div>
              ))}
            </div>

            <label className="grid gap-1 text-sm">Justificativa da publicação
              <Input maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} />
            </label>
            {(validation || extraError) && (
              <p role="alert" className="rounded-md border p-3 text-sm text-amber-700 dark:text-amber-300">
                {validation || extraError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!noError}
                onClick={makePreview}><ShieldCheck className="mr-2 h-4 w-4"/>Prévia de horários</Button>
              <Button type="button" disabled={!canPublish} onClick={() => void save()}>
                <CheckCircle2 className="mr-2 h-4 w-4"/> {publishing ? "Publicando…" : "Confirmar publicação"}
              </Button>
              <Button type="button" variant="ghost"
                onClick={() => { setDraft(null);setPreview(null); }}>Cancelar</Button>
            </div>

            {previewIsCurrent && preview && (
              <div className="rounded-md border p-3">
                <h4 className="mb-2 font-semibold">Prévia — sem alteração de dados</h4>
                <p className="mb-3 text-xs text-muted-foreground">
                  Primeiros sete dias de vigência e exceções selecionadas; a prévia não confirma
                  impactos históricos nem produz registros de jornada.
                </p>
                <div className="space-y-2">
                  {preview.lines.map(day => (
                    <div key={day.date} className="flex flex-wrap justify-between gap-2 border-b pb-1 text-sm">
                      <span>{day.date} · {day.reason}</span>
                      <strong>{labelWindows(day.windows)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <History className="h-4 w-4 shrink-0" aria-hidden="true" />
          Revisões anteriores permanecem consultáveis. Alterações retroativas exigem aprovação
          específica e prévia de impacto, ainda não disponível nesta etapa.
        </p>
      )}
    </section>
  );
}
