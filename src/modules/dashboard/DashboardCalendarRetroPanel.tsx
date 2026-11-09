import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock3, History, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarVersionRecord } from "./dashboardOperationalSettingsRepository";
import { selectGlobalCalendarForDate } from "./dashboardCalendarTimeline";
import {
  listCalendarRetroRequests, previewCalendarRetroRequest, requestCalendarRetroReview,
  type CalendarRetroPreview, type CalendarRetroRequest,
} from "./dashboardCalendarRetroRepository";

function brazilToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function previousDay(date: string): string {
  const [y,m,d] = date.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);
}

/** Manager-gated by the containing Settings page and again in each SQL RPC. */
export function DashboardCalendarRetroPanel({ calendars }: { calendars: CalendarVersionRecord[] }) {
  const [date, setDate] = useState("");
  const [working, setWorking] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<CalendarRetroRequest[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ fingerprint: string; result: CalendarRetroPreview } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listCalendarRetroRequests();
      setRows(result.rows);
      setAvailable(result.state === "available");
    } catch (cause) {
      setAvailable(false);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar solicitações.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const resolved = date ? selectGlobalCalendarForDate(calendars,date) : null;
  const targetId = resolved?.state === "available" ? resolved.calendar.id : "";
  const fingerprint = JSON.stringify([targetId,date,working,start,end,reason]);
  const previewCurrent = Boolean(preview && preview.fingerprint === fingerprint);
  const valid = Boolean(available && targetId && date && date < brazilToday() &&
    reason.trim().length >= 3 && (!working || (start && end && start < end)));
  const canSubmit = valid && previewCurrent && !busy && !loading;
  const yesterday = previousDay(brazilToday());

  const inspect = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const result = await previewCalendarRetroRequest({ calendarVersionId: targetId, date });
      setPreview({ fingerprint, result });
    } catch (cause) {
      setPreview(null);
      toast.error(cause instanceof Error ? cause.message : "Falha na prévia da correção.");
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (!window.confirm("Registrar somente uma SOLICITAÇÃO de correção histórica? Nenhum cálculo, feriado ou calendário será alterado.")) return;
    setBusy(true);
    try {
      await requestCalendarRetroReview({
        calendarVersionId: targetId, date, working,
        start: working ? start : null, end: working ? end : null, reason: reason.trim(),
      });
      toast.success("Solicitação registrada para revisão. Nenhuma correção foi aplicada.");
      setDate(""); setStart(""); setEnd(""); setReason(""); setPreview(null);
      await reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível registrar a solicitação.");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-5 w-5" aria-hidden="true" />
          Correções retroativas — solicitar revisão
        </CardTitle>
        <CardDescription>
          Solicitações históricas são registradas com auditoria e prévia consultiva.
          Este formulário <strong>não aplica a correção</strong>. Aprovação e aplicação serão processos separados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status" className="text-sm">Carregando solicitações…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !available && !error && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            Solicitações indisponíveis: a migration de auditoria retroativa ainda não foi aplicada.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Data histórica
            <Input type="date" max={yesterday} value={date}
              disabled={!available || busy}
              onChange={event => {setDate(event.target.value);setPreview(null);}} />
          </label>
          <div className="grid gap-1 text-sm">
            <span className="font-medium">Versão vigente naquela data</span>
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              {resolved?.state === "available"
                ? "v" + resolved.calendar.version + " · " +
                  (calendars.find(row => row.id === targetId)?.name ?? "Calendário geral")
                : resolved?.state === "unavailable" ? resolved.reason : "Selecione uma data"}
            </p>
          </div>
          <label className="grid gap-1 text-sm">
            Tipo solicitado
            <select className="h-10 rounded-md border bg-background px-3"
              value={working ? "working" : "closed"} disabled={!available || busy}
              onChange={event => {setWorking(event.target.value==="working");setPreview(null);}}>
              <option value="closed">Sem expediente</option>
              <option value="working">Expediente especial</option>
            </select>
          </label>
          {working && (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm">Início
                <Input type="time" disabled={!available || busy} value={start}
                  onChange={event => {setStart(event.target.value);setPreview(null);}} />
              </label>
              <label className="grid gap-1 text-sm">Fim
                <Input type="time" disabled={!available || busy} value={end}
                  onChange={event => {setEnd(event.target.value);setPreview(null);}} />
              </label>
            </div>
          )}
          <label className="grid gap-1 text-sm sm:col-span-2">
            Motivo da solicitação
            <Input disabled={!available || busy} maxLength={1000}
              value={reason} onChange={event => {setReason(event.target.value);setPreview(null);}}
              placeholder="Explique a correção pretendida e sua justificativa" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void inspect()} disabled={!valid || busy}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Prévia de impacto
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? "Processando…" : "Registrar solicitação"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void reload()} disabled={busy || loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
        {previewCurrent && preview && (
          <div className="rounded-md border p-3 text-sm">
            <p>Intervalos candidatos no dia: <strong>{preview.result.stage_intervals_candidates}</strong></p>
            <p>Com marco inicial verificado: <strong>{preview.result.verified_stage_intervals_candidates}</strong></p>
            <p className="mt-2 flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true"/>
              A prévia não comprova mudança de minutos, criticidade ou alertas.
              A solicitação não altera dados operacionais.
            </p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold text-sm">Solicitações registradas</p>
            {rows.map(row => (
              <div key={row.id} className="rounded-md border p-2 text-sm">
                <p><strong>{row.exception_date}</strong> · {row.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Pendente de revisão · solicitada em{" "}
                  {new Date(row.submitted_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-4 w-4 shrink-0"/>
          A aprovação e aplicação retroativa exigirão novo fluxo, simulação completa e autorização específica.
        </p>
      </CardContent>
    </Card>
  );
}
