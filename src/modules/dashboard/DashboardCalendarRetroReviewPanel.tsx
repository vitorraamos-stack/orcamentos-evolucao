import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";
import {
  listCalendarRetroReviewEvents, previewCalendarRetroReview, recordCalendarRetroReview,
  type CalendarRetroReviewEvent, type CalendarRetroReviewPreview,
} from "./dashboardCalendarRetroReviewRepository";

const labelDate = (date: string) => date.split("-").reverse().join("/");
const formatMinutes = (minutes: number) => {
  const sign = minutes < 0 ? "−" : "";
  const absolute = Math.abs(minutes);
  return sign + Math.floor(absolute / 60) + "h " + String(absolute % 60).padStart(2, "0") + "min";
};

/** Manager review is non-operative: review opinions do not change OS or calendars. */
export function DashboardCalendarRetroReviewPanel({ requests }: { requests: CalendarRetroRequest[] }) {
  const [events, setEvents] = useState<CalendarRetroReviewEvent[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [preview, setPreview] = useState<CalendarRetroReviewPreview | null>(null);
  const [action, setAction] = useState<"needs_evidence" | "rejected">("needs_evidence");
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listCalendarRetroReviewEvents();
      setEvents(result.rows);
      setAvailable(result.state === "available");
    } catch (cause) {
      setAvailable(false);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar pareceres.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const rejectedIds = new Set(events.filter(event => event.action === "rejected")
    .map(event => event.request_id));
  const selectable = requests.filter(request => !rejectedIds.has(request.id));
  const selected = selectable.find(request => request.id === requestId);
  const currentPreview = selected && preview?.request_id === selected.id ? preview : null;
  const canRecord = available && !loading && !busy && currentPreview !== null &&
    !currentPreview.already_rejected && reason.trim().length >= 3 &&
    reason.trim().length <= 1000;

  const inspect = async () => {
    if (!selected || !available || busy) return;
    setBusy(true); setPreview(null);
    try {
      setPreview(await previewCalendarRetroReview(selected.id));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha na simulação.");
    } finally { setBusy(false); }
  };

  const record = async () => {
    if (!canRecord || !selected || !currentPreview) return;
    const verb = action === "rejected" ? "rejeição definitiva" : "necessidade de complementação";
    if (!window.confirm("Registrar " + verb + " desta solicitação? Nenhuma alteração histórica será aplicada.")) return;
    setBusy(true);
    try {
      await recordCalendarRetroReview({
        requestId: selected.id, action, reason: reason.trim(), expectedPreview: currentPreview,
      });
      toast.success("Parecer gerencial registrado com auditoria. Nenhuma correção aplicada.");
      setReason(""); setPreview(null);
      if (action === "rejected") setRequestId("");
      await refresh();
    } catch (cause) {
      setPreview(null);
      toast.error(cause instanceof Error ? cause.message : "Não foi possível registrar o parecer.");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" /> Revisão gerencial das correções históricas
        </CardTitle>
        <CardDescription>
          Compare os minutos planejados do calendário geral na data selecionada e registre um parecer.
          A simulação não comprova impacto por OS ou alertas. Aprovação e aplicação permanecem bloqueadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status" className="text-sm">Consultando pareceres…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !available && !error && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            Revisão indisponível: migration gerencial ainda não aplicada.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-60 flex-1 gap-1.5 text-sm">
            Solicitação aguardando decisão
            <select className="h-10 rounded-md border bg-background px-3"
              disabled={!available || busy || loading} value={selected ? requestId : ""}
              onChange={event => { setRequestId(event.target.value); setPreview(null); setReason(""); }}>
              <option value="">Selecione a solicitação</option>
              {selectable.map(row => (
                <option key={row.id} value={row.id}>
                  {labelDate(row.exception_date)} · {row.reason.slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => void inspect()}
            disabled={!selected || !available || busy || loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Simular impacto
          </Button>
          <Button type="button" variant="ghost" onClick={() => void refresh()} disabled={busy || loading}>
            Atualizar pareceres
          </Button>
        </div>
        {available && !loading && selectable.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação disponível para revisão.</p>
        )}
        {currentPreview && (
          <div className="space-y-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold">Comparação da jornada geral — {labelDate(currentPreview.exception_date)}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <p>Antes: <strong>{formatMinutes(currentPreview.base_minutes_before)}</strong></p>
              <p>Proposta: <strong>{formatMinutes(currentPreview.base_minutes_proposed)}</strong></p>
              <p>Diferença: <strong>{formatMinutes(currentPreview.base_minutes_delta)}</strong></p>
            </div>
            <p>Intervalos candidatos: {currentPreview.stage_intervals_candidates} · com marco verificado: {currentPreview.verified_stage_intervals_candidates}</p>
            <p>Intervalos sem evidência completa: {currentPreview.unverified_stage_intervals} · ainda abertos: {currentPreview.open_stage_intervals}</p>
            <p>Setores com calendários a conferir: {currentPreview.sector_calendars_to_review} · limites a conferir: {currentPreview.thresholds_to_review}</p>
            <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {currentPreview.observacao}
            </p>
            <div className="border-t pt-3 space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Aprovação bloqueada até validar o efeito por OS, pausas e alertas
              </p>
              <label className="grid gap-1.5 text-sm">
                Parecer gerencial
                <select className="h-10 rounded-md border bg-background px-3"
                  disabled={busy} value={action}
                  onChange={event => setAction(event.target.value as "needs_evidence" | "rejected")}>
                  <option value="needs_evidence">Registrar necessidade de mais evidências</option>
                  <option value="rejected">Rejeitar solicitação definitivamente</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                Justificativa do parecer
                <Input value={reason} maxLength={1000} disabled={busy}
                  onChange={event => setReason(event.target.value)}
                  placeholder="Descreva as evidências faltantes ou o motivo da rejeição" />
              </label>
              <Button type="button" onClick={() => void record()} disabled={!canRecord}>
                Registrar parecer (sem aplicar)
              </Button>
            </div>
          </div>
        )}
        {events.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Histórico imutável de pareceres</p>
            {events.map(event => {
              const request = requests.find(row => row.id === event.request_id);
              return (
                <div key={event.id} className="rounded-md border p-3 text-sm">
                  <p><strong>{event.action === "rejected" ? "Rejeitada" : "Mais evidências solicitadas"}</strong>
                    {" · "}{request ? labelDate(request.exception_date) : "Solicitação " + event.request_id}
                  </p>
                  <p>{event.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.reviewed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    {" · "}Sem alteração de calendário ou OS
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
