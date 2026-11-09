import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";
import { buildRetroOverview, type RetroOverviewStatus } from "./dashboardCalendarRetroOverview";
import { previewRetroServerDayImpact, type RetroServerDayImpact } from "./dashboardCalendarRetroServerImpactRepository";
import { previewRetroFullStageAlerts, type RetroFullStagePreview } from "./dashboardCalendarRetroFullStageRepository";
import {
  listRetroApprovalDossiers, prepareRetroApprovalDossier, previewRetroApprovalPreflight,
  type RetroApprovalDossier, type RetroApprovalPreflight,
} from "./dashboardCalendarRetroApprovalRepository";

const labels: Record<RetroOverviewStatus, string> = {
  pending: "Requer conferência",
  alert_change: "Possível mudança de alerta",
  time_change: "Diferença de permanência",
  unchanged: "Sem diferença identificada",
};
const severities: Record<string, string> = {
  normal: "Normal", attention: "Atenção", critical: "Crítico",
};
const minutes = (value: number | null) => value === null ? "—" :
  Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "min";
const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Não foi possível concluir a consulta.";

export function DashboardCalendarRetroApprovalPanel({ request }: {
  request: CalendarRetroRequest;
}) {
  const [preflight, setPreflight] = useState<RetroApprovalPreflight | null>(null);
  const [daily, setDaily] = useState<RetroServerDayImpact | null>(null);
  const [full, setFull] = useState<RetroFullStagePreview | null>(null);
  const [analysisErrors, setAnalysisErrors] = useState<string[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisPerformed, setAnalysisPerformed] = useState(false);
  const [filter, setFilter] = useState<RetroOverviewStatus | "all">("all");
  const [dossiers, setDossiers] = useState<RetroApprovalDossier[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await listRetroApprovalDossiers(request.id);
      setAvailable(response.state === "available");
      setDossiers(response.rows);
    } catch (cause) {
      setAvailable(false);
      setError(errorMessage(cause));
    } finally { setLoading(false); }
  }, [request.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const analyze = async () => {
    if (!available || analysisBusy || loading || sending) return;
    setAnalysisBusy(true);
    setAnalysisPerformed(false);
    setPreflight(null); setDaily(null); setFull(null);
    setAnalysisErrors([]); setFilter("all");
    try {
      const [p, d, f] = await Promise.allSettled([
        previewRetroApprovalPreflight(request.id),
        previewRetroServerDayImpact(request.id),
        previewRetroFullStageAlerts(request.id),
      ]);
      if (p.status === "fulfilled") setPreflight(p.value);
      if (d.status === "fulfilled") setDaily(d.value);
      if (f.status === "fulfilled") setFull(f.value);
      const errors: string[] = [];
      if (p.status === "rejected") errors.push("Conferência gerencial: " + errorMessage(p.reason));
      if (d.status === "rejected") errors.push("Simulação diária: " + errorMessage(d.reason));
      if (f.status === "rejected") errors.push("Permanência completa: " + errorMessage(f.reason));
      setAnalysisErrors(errors);
      setAnalysisPerformed(true);
    } finally { setAnalysisBusy(false); }
  };

  const overview = buildRetroOverview({ requestId: request.id, preflight, day: daily, full });
  const consistent = analysisPerformed && overview.complete && analysisErrors.length === 0;
  const displayedOrders = overview.orders.filter(order =>
    filter === "all" || order.status === filter);

  const send = async () => {
    if (!consistent || !preflight || loading || sending || analysisBusy ||
        reason.trim().length < 3 || reason.trim().length > 1000) return;
    if (!window.confirm(
      "Encaminhar esta prévia para verificação técnica? NÃO aprova nem aplica correções históricas."
    )) return;
    setSending(true);
    try {
      await prepareRetroApprovalDossier({
        requestId: request.id, expectedPreview: preflight, reason: reason.trim(),
      });
      toast.success("Encaminhamento auditado. Nenhuma OS, calendário ou alerta foi alterado.");
      setReason(""); setPreflight(null); setDaily(null); setFull(null);
      setAnalysisPerformed(false);
      await refresh();
    } catch (cause) {
      setPreflight(null); setDaily(null); setFull(null);
      setAnalysisPerformed(false);
      toast.error(errorMessage(cause));
    } finally { setSending(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Análise gerencial consolidada
        </CardTitle>
        <CardDescription>
          Um único comando consulta as evidências, o impacto diário e a permanência
          completa das OS. Os alertas exibidos são hipóteses para revisão,
          nunca alterações aprovadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status" className="text-sm">Consultando histórico…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !available && !error && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            Análise indisponível: as migrations de revisão gerencial ainda não foram aplicadas.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline"
            disabled={!available || analysisBusy || loading || sending}
            onClick={() => void analyze()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {analysisBusy ? "Conferindo evidências e OS…" : "Analisar solicitação"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Somente leitura · {request.exception_date.split("-").reverse().join("/")}
          </span>
        </div>
        {analysisPerformed && (
          <div className="space-y-4">
            {analysisErrors.map((message, index) => (
              <p key={index} role="alert" className="text-sm text-destructive">{message}</p>
            ))}
            {overview.warnings.length > 0 && (
              <div className="space-y-1 border-l-2 border-amber-500 pl-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Análise incompleta ou divergente
                </p>
                {overview.warnings.map((item, index) => (
                  <p key={index}>{item}</p>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">OS identificadas</p>
                <p className="text-xl font-semibold">{overview.orders.length}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">OS com diferença calculada</p>
                <p className="text-xl font-semibold">{overview.affectedOrders}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Possíveis mudanças de alerta</p>
                <p className="text-xl font-semibold">{overview.candidateAlertChanges}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">OS com pendências</p>
                <p className="text-xl font-semibold">{overview.pendingOrders}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As consultas são independentes, sem fotografia transacional única.
              Quantidades e níveis podem mudar entre leituras. Os números só
              incluem registros disponíveis; não comprovam cobertura histórica.
            </p>
            {preflight && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Pendências de validação gerencial ({preflight.reasons.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preflight.reasons.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {preflight.unverified_intervals} intervalos não verificados ·
                  {" "}{preflight.incomplete_pauses} pausas inconclusivas ·
                  {" "}{preflight.sector_revisions_to_check} revisões setoriais a conferir.
                </p>
              </details>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Resultado por OS</p>
                <label className="flex items-center gap-2 text-sm">
                  Mostrar
                  <select className="h-9 rounded-md border bg-background px-2"
                    value={filter}
                    onChange={event => setFilter(event.target.value as RetroOverviewStatus | "all")}>
                    <option value="all">Todas</option>
                    <option value="pending">Com pendências</option>
                    <option value="alert_change">Possível mudança de alerta</option>
                    <option value="time_change">Diferença de tempo</option>
                    <option value="unchanged">Sem diferença</option>
                  </select>
                </label>
              </div>
              {displayedOrders.map(order => (
                <details key={order.id} className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    OS {order.id} · {labels[order.status]} · {order.stages.length}
                    {" "}{order.stages.length === 1 ? "etapa" : "etapas"}
                  </summary>
                  <div className="mt-3 space-y-2">
                    <Link href={"/os/" + encodeURIComponent(order.id)}
                      className="inline-flex text-sm font-medium underline underline-offset-2">
                      Abrir OS no EvoluSystem
                    </Link>
                    {order.stages.map(stage => (
                      <div key={stage.id} className="rounded-md border p-2 text-xs">
                        <p className="font-semibold">{stage.scope} · {labels[stage.status]}</p>
                        {stage.full?.state === "verified" && (
                          <p>Permanência útil: {minutes(stage.full.useful_before)} →
                            {" "}{minutes(stage.full.useful_proposed)}</p>
                        )}
                        {stage.day?.state === "verified" && (
                          <p>Impacto neste dia: {minutes(stage.day.useful_minutes_before)} →
                            {" "}{minutes(stage.day.useful_minutes_proposed)}</p>
                        )}
                        {stage.full?.severity_status === "candidate" && (
                          <p>Alerta candidato: {severities[stage.full.severity_before ?? ""] ?? "Indisponível"}
                            {" → "}{severities[stage.full.severity_proposed ?? ""] ?? "Indisponível"}</p>
                        )}
                        {stage.issues.map((issue, index) => (
                          <p key={index} className="text-amber-700 dark:text-amber-300">
                            Pendente: {issue}
                          </p>
                        ))}
                        {stage.full?.state === "verified" && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-muted-foreground">
                              Ver jornada e pausas
                            </summary>
                            <p>Jornada: {minutes(stage.full.gross_before)} →
                              {" "}{minutes(stage.full.gross_proposed)}</p>
                            <p>Pausas: {minutes(stage.full.pause_before)} →
                              {" "}{minutes(stage.full.pause_proposed)}</p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {displayedOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma OS encontrada para esse filtro.
                </p>
              )}
            </div>
            <div className="space-y-3 border-t pt-3">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Aprovação e aplicação de correções continuam bloqueadas.
              </p>
              <label className="grid gap-1.5 text-sm">
                Justificativa do encaminhamento técnico
                <Input value={reason} disabled={sending || analysisBusy}
                  maxLength={1000} placeholder="Informe o que ainda precisa ser conferido"
                  onChange={event => setReason(event.target.value)} />
              </label>
              <Button type="button" onClick={() => void send()}
                disabled={!consistent || sending || analysisBusy ||
                  reason.trim().length < 3 || reason.trim().length > 1000}>
                <ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />
                Encaminhar para validação técnica (sem aplicar)
              </Button>
              {!consistent && (
                <p className="text-xs text-muted-foreground">
                  Um encaminhamento só pode ser registrado após as três consultas
                  retornarem resultados estruturalmente coerentes.
                </p>
              )}
            </div>
          </div>
        )}
        {dossiers.length > 0 && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Histórico de encaminhamentos ({dossiers.length})
            </summary>
            <div className="mt-2 space-y-2">
              {dossiers.map(item => (
                <div key={item.id} className="rounded border p-2">
                  <p className="font-medium">Aguardando verificação técnica</p>
                  <p>{item.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString("pt-BR",
                      { timeZone: "America/Sao_Paulo" })} · Sem aplicação
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
