import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";
import { previewRetroServerDayImpact, type RetroServerDayImpact } from "./dashboardCalendarRetroServerImpactRepository";
import {
  listRetroApprovalDossiers, prepareRetroApprovalDossier, previewRetroApprovalPreflight,
  type RetroApprovalDossier, type RetroApprovalPreflight,
} from "./dashboardCalendarRetroApprovalRepository";

const statusText = "Aguardando verificação técnica";

export function DashboardCalendarRetroApprovalPanel({ request }: {
  request: CalendarRetroRequest;
}) {
  const [preview, setPreview] = useState<RetroApprovalPreflight | null>(null);
  const [dossiers, setDossiers] = useState<RetroApprovalDossier[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [serverImpact, setServerImpact] = useState<RetroServerDayImpact | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listRetroApprovalDossiers(request.id);
      setAvailable(result.state === "available");
      setDossiers(result.rows);
    } catch (cause) {
      setAvailable(false);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar encaminhamentos.");
    } finally { setLoading(false); }
  }, [request.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const check = async () => {
    if (!available || checking || sending || serverBusy) return;
    setPreview(null); setServerImpact(null); setServerError(""); setChecking(true);
    try {
      setPreview(await previewRetroApprovalPreflight(request.id));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha na checagem de aprovação.");
    } finally { setChecking(false); }
  };

  const inspectServerImpact = async () => {
    if (!available || checking || sending || serverBusy) return;
    setServerBusy(true); setServerImpact(null); setServerError("");
    try {
      setServerImpact(await previewRetroServerDayImpact(request.id));
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : "Falha na análise das OS.");
    } finally { setServerBusy(false); }
  };

  const send = async () => {
    if (!preview || sending || checking || serverBusy || reason.trim().length < 3) return;
    if (!window.confirm(
      "Registrar encaminhamento para verificação técnica? Esta ação NÃO aprova, aplica ou altera nenhuma correção histórica."
    )) return;
    setSending(true);
    try {
      await prepareRetroApprovalDossier({
        requestId: request.id, expectedPreview: preview, reason: reason.trim(),
      });
      toast.success("Encaminhamento auditado registrado. Nenhuma correção foi aplicada.");
      setReason(""); setPreview(null);
      await refresh();
    } catch (cause) {
      setPreview(null);
      toast.error(cause instanceof Error ? cause.message : "Falha ao encaminhar a análise.");
    } finally { setSending(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Preparação para aprovação controlada
        </CardTitle>
        <CardDescription>
          O servidor confere as evidências antes de qualquer decisão. O encaminhamento
          para validação técnica é auditado, mas não equivale à aprovação nem à aplicação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !available && !error && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Etapa indisponível: a migration de preparação da aprovação ainda não foi aplicada.
          </p>
        )}
        <Button type="button" variant="outline" disabled={!available || checking || sending || serverBusy || loading}
          onClick={() => void check()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {checking ? "Verificando no servidor…" : "Revalidar condições de aprovação"}
        </Button>
        <div className="space-y-2 border-t pt-3">
          <Button type="button" variant="outline"
            disabled={!available || checking || sending || serverBusy || loading}
            onClick={() => void inspectServerImpact()}>
            {serverBusy ? "Calculando etapas no Supabase…" : "Conferir impacto diário das OS no servidor"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Prévia somente leitura do dia solicitado. Não comprova alertas,
            cobertura histórica completa ou autorização para aplicação.
          </p>
          {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
          {serverImpact && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-semibold">Resultado calculado no Supabase — {serverImpact.exception_date.split("-").reverse().join("/")}</p>
              <p>{serverImpact.candidate_orders} OS candidatas ·
                {" "}{serverImpact.verified_intervals} etapas verificadas ·
                {" "}{serverImpact.insufficient_intervals} inconclusivas ·
                {" "}{serverImpact.changed_intervals} com diferença de tempo</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">{serverImpact.observacao}</p>
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer font-medium">
                  Ver etapas e justificativas ({serverImpact.rows.length})
                </summary>
                <div className="mt-2 max-h-96 space-y-2 overflow-y-auto">
                  {serverImpact.rows.map(row => (
                    <div key={row.interval_id} className="rounded border p-2 text-xs">
                      <p className="font-medium">OS {row.order_id} · {row.scope}</p>
                      {row.state === "verified" ? (
                        <>
                          <p>Jornada no dia: {row.minutes_before} min → {row.minutes_proposed} min</p>
                          <p>Pausas verificadas: {row.pause_minutes_before} min → {row.pause_minutes_proposed} min</p>
                          <p>Tempo útil sem pausa: {row.useful_minutes_before} min → {row.useful_minutes_proposed} min</p>
                        </>
                      ) : <p className="text-amber-700 dark:text-amber-300">
                        Inconclusivo: {row.reason}
                      </p>}
                    </div>
                  ))}
                  {serverImpact.rows.length === 0 && (
                    <p className="text-muted-foreground">
                      Nenhum intervalo registrado nessa data. Isso não comprova ausência
                      de atividades antes da instrumentação.
                    </p>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
        {preview && (
          <div className="space-y-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Aprovação e aplicação bloqueadas
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <p>OS candidatas: <strong>{preview.candidate_orders}</strong></p>
              <p>Intervalos registrados: <strong>{preview.stage_intervals}</strong></p>
              <p>Intervalos não verificados: <strong>{preview.unverified_intervals}</strong></p>
              <p>Vínculos incompletos: <strong>{preview.unlinked_intervals}</strong></p>
              <p>Pausas inconclusivas: <strong>{preview.incomplete_pauses}</strong></p>
              <p>Regras setoriais a revisar: <strong>{preview.sector_revisions_to_check}</strong></p>
              <p>Limites de alerta a revisar: <strong>{preview.thresholds_to_check}</strong></p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Pendências verificadas no servidor</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {preview.reasons.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
            <label className="grid gap-1.5">
              <span className="font-medium">Justificativa para encaminhamento</span>
              <Input value={reason} disabled={sending || checking}
                maxLength={1000} placeholder="Informe a documentação ou conferência necessária"
                onChange={event => setReason(event.target.value)} />
            </label>
            <Button type="button" onClick={() => void send()}
              disabled={sending || checking || reason.trim().length < 3 || reason.trim().length > 1000}>
              <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
              {sending ? "Registrando…" : "Encaminhar para validação técnica"}
            </Button>
          </div>
        )}
        {dossiers.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-semibold">Encaminhamentos auditados</p>
            {dossiers.map(item => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{statusText}</p>
                <p>{item.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("pt-BR",
                    { timeZone: "America/Sao_Paulo" })} · Sem aplicação
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
