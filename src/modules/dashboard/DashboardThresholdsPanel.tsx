import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { OperationalScope } from "./dashboardAdvanced";
import type { CalendarVersionRecord } from "./dashboardOperationalSettingsRepository";
import {
  loadPublishedThresholds, loadThresholdHistory, previewThresholds, publishThresholds,
  type PublishedThreshold, type ThresholdHistory, type ThresholdPreview,
} from "./dashboardThresholdsRepository";

const SCOPES: Array<{ scope: OperationalScope; label: string }> = [
  { scope: "ART", label: "Arte" },
  { scope: "APPROVAL", label: "Aprovação" },
  { scope: "PRODUCTION", label: "Produção" },
  { scope: "FINISHING", label: "Acabamento" },
  { scope: "INSTALLATION", label: "Instalação" },
  { scope: "LOGISTICS", label: "Logística" },
];

type Draft = {
  scope: OperationalScope;
  attention: string;
  critical: string;
  calendar: string;
  reason: string;
};
function fingerprint(draft: Draft) {
  return JSON.stringify([draft.scope, draft.attention, draft.critical, draft.calendar]);
}

/** O editor permanece indisponível até que a migration esteja aplicada e lida. */
export function DashboardThresholdsPanel({ calendars }: { calendars: CalendarVersionRecord[] }) {
  const [rows, setRows] = useState<PublishedThreshold[]>([]);
  const [history, setHistory] = useState<ThresholdHistory[]>([]);
  const [schemaAvailable, setSchemaAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ fingerprint: string; result: ThresholdPreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [current, revisions] = await Promise.all([loadPublishedThresholds(), loadThresholdHistory()]);
      setSchemaAvailable(current.state === "available");
      setRows(current.rows);
      setHistory(revisions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar os limites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const startEditing = (scope: OperationalScope) => {
    const existing = rows.find(row => row.scope === scope);
    setDraft({
      scope, attention: existing ? String(existing.attention_limit_minutes) : "",
      critical: existing ? String(existing.critical_limit_minutes) : "",
      calendar: existing?.calendar_version_id ?? "", reason: "",
    });
    setPreview(null);
  };
  const update = (patch: Partial<Draft>) => {
    setDraft(current => current ? { ...current, ...patch } : current);
    setPreview(null);
  };
  const valid = Boolean(
    draft && draft.calendar && draft.attention.trim() && draft.critical.trim() &&
    Number.isSafeInteger(Number(draft.attention)) && Number.isSafeInteger(Number(draft.critical)) &&
    Number(draft.attention) > 0 && Number(draft.critical) > Number(draft.attention),
  );
  const previewCurrent = Boolean(draft && preview && preview.fingerprint === fingerprint(draft));
  const canPublish = Boolean(schemaAvailable && !loading && valid && previewCurrent &&
    draft && draft.reason.trim().length >= 3 && !publishing && !previewing);
  const effectiveCalendar = useMemo(() => new Set(calendars.map(row => row.id)), [calendars]);

  const runPreview = async () => {
    if (!draft || !valid || !effectiveCalendar.has(draft.calendar)) return;
    setPreviewing(true);
    try {
      const result = await previewThresholds({
        scope: draft.scope,
        attentionMinutes: Number(draft.attention),
        criticalMinutes: Number(draft.critical),
        calendarVersionId: draft.calendar,
      });
      setPreview({ fingerprint: fingerprint(draft), result });
    } catch (cause) {
      setPreview(null);
      toast.error(cause instanceof Error ? cause.message : "Falha na prévia dos limites.");
    } finally { setPreviewing(false); }
  };

  const save = async () => {
    if (!draft || !canPublish || !effectiveCalendar.has(draft.calendar)) return;
    const published = rows.find(row => row.scope === draft.scope);
    if (!window.confirm("Publicar os limites de " + draft.scope + " como nova revisão auditada?")) return;
    setPublishing(true);
    try {
      await publishThresholds({
        scope: draft.scope,
        attentionMinutes: Number(draft.attention),
        criticalMinutes: Number(draft.critical),
        calendarVersionId: draft.calendar,
        expectedRevision: published?.revision ?? 0,
        reason: draft.reason.trim(),
      });
      toast.success("Limites publicados com histórico e revisão.");
      setDraft(null); setPreview(null);
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao publicar os limites.");
    } finally { setPublishing(false); }
  };

  return (
    <section className="space-y-4" aria-label="Limites de permanência operacional">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
              Atenção e Crítico por setor
            </CardTitle>
            <CardDescription>
              Limites da permanência TOTAL em horas úteis, separados da execução e da espera.
              Nenhuma regra é publicada automaticamente.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" disabled={loading || publishing} onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p role="status">Consultando limites operacionais…</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {!schemaAvailable && !loading && !error && (
            <p role="status" className="rounded-lg border p-3 text-sm text-amber-700 dark:text-amber-300">
              Limites indisponíveis: a migration da Etapa 1 ainda não foi aplicada.
              Não é possível publicar ou simular dados antes da autorização técnica.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SCOPES.map(({ scope, label }) => {
              const rule = rows.find(row => row.scope === scope);
              return (
                <div className="rounded-lg border p-3" key={scope}>
                  <strong className="block">{label}</strong>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Atenção: {rule ? rule.attention_limit_minutes + " min" : "Não publicado"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Crítico: {rule ? rule.critical_limit_minutes + " min" : "Não publicado"}
                  </p>
                  {rule && <p className="mt-1 text-xs text-muted-foreground">Revisão v{rule.revision}</p>}
                  <Button className="mt-3 w-full" type="button" variant="outline"
                    disabled={!schemaAvailable || loading} onClick={() => startEditing(scope)}>
                    {rule ? "Revisar limites" : "Configurar limites"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {draft && schemaAvailable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limites de {SCOPES.find(row => row.scope === draft.scope)?.label}</CardTitle>
            <CardDescription>Obrigatório consultar a prévia antes de publicar. Os valores não são preenchidos por suposição.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Atenção (minutos úteis)
                <Input type="number" step="1" min="1" value={draft.attention}
                  onChange={event => update({ attention: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Crítico (minutos úteis)
                <Input type="number" step="1" min="1" value={draft.critical}
                  onChange={event => update({ critical: event.target.value })} />
              </label>
            </div>
            <label className="grid gap-1 text-sm">Calendário publicado
              <select className="h-10 rounded-md border border-input bg-background px-3"
                value={draft.calendar} onChange={event => update({ calendar: event.target.value })}>
                <option value="">Selecione</option>
                {calendars.map(calendar => <option value={calendar.id} key={calendar.id}>
                  {calendar.name} · v{calendar.version}
                </option>)}
              </select>
            </label>
            {!valid && <p className="text-xs text-muted-foreground">
              Informe valores inteiros positivos, com Crítico maior que Atenção, e selecione um calendário.
            </p>}
            <label className="grid gap-1 text-sm">Justificativa obrigatória
              <Input maxLength={1000} value={draft.reason}
                onChange={event => update({ reason: event.target.value })} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="button" disabled={!valid || previewing || !effectiveCalendar.has(draft.calendar)}
                onClick={() => void runPreview()}>
                <ShieldCheck className="mr-2 h-4 w-4" />{previewing ? "Consultando…" : "Prévia de impacto"}
              </Button>
              <Button type="button" disabled={!canPublish} onClick={() => void save()}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> {publishing ? "Publicando…" : "Confirmar publicação"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => {setDraft(null);setPreview(null);}}>Cancelar</Button>
            </div>
            {previewCurrent && preview && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p><strong>{preview.result.os_consultadas}</strong> OS do setor consultadas</p>
                <p><strong>{preview.result.intervalos_candidatos}</strong> intervalos potenciais com marco verificado</p>
                <p className="mt-2 flex gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Prévia conservadora: estes números NÃO representam quantidade de OS em Atenção ou Crítico.
                  O cálculo real depende dos históricos completos. A simulação não modifica alertas.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Histórico de limites
          </CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {history.map(entry => (
              <div key={entry.id} className="rounded-md border p-3 text-sm">
                <strong>{entry.scope} · revisão {entry.revision}</strong>
                <p>{entry.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
