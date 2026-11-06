import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, GitBranch, RefreshCw, ShieldAlert, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { listDashboardOrders } from "./dashboardRepository";
import {
  advancedSummary, buildAdvancedAssessments,
  type AdvancedOrderAssessment, type AdvancedSources,
} from "./dashboardAdvanced";
import { listDashboardAdvancedSources } from "./dashboardAdvancedRepository";
import { WORK_CENTER_LABELS, type WorkCenter } from "@/modules/production/operations";

const workCenterLabel = (center: string) =>
  Object.prototype.hasOwnProperty.call(WORK_CENTER_LABELS, center)
    ? WORK_CENTER_LABELS[center as WorkCenter] : center;

type Result = { rows: AdvancedOrderAssessment[]; source: AdvancedSources };
type Filter = "attention" | "blocked" | "dependencies" | "all";

function OperationDependencies({ row, source }: {
  row: AdvancedOrderAssessment; source: AdvancedSources;
}) {
  const graph = row.dependency;
  if (graph.state === "unavailable") return (
    <p className="evolu-dashboard__advanced-muted">
      Dependências não disponíveis: não existe registro estruturado consultável para esta OS.
      Não foram inferidas sequências entre atividades.
    </p>
  );
  const operations = new Map(source.operations.map(op => [op.id, op]));
  const describe = (id: string) => {
    const op = operations.get(id);
    return op ? workCenterLabel(op.work_center) + " (" + op.status + ")" : "Atividade não identificada";
  };
  const active = graph.rows.filter(op => op.predecessorIds.length);
  return (
    <div className="space-y-2">
      <p className="evolu-dashboard__advanced-muted">
        {graph.linkCount} vínculo(s) registrado(s) · {graph.waitingCount} sucessora(s) aguardando
        {graph.state === "insufficient" ? " · dados insuficientes" : ""}
      </p>
      {graph.problems.map(problem =>
        <p key={problem} className="evolu-dashboard__advanced-warning">{problem}</p>)}
      {active.length === 0
        ? <p className="evolu-dashboard__advanced-muted">Nenhuma dependência explícita registrada nesta OS.</p>
        : active.map(op => (
          <div key={op.operationId} className="evolu-dashboard__advanced-dependency">
            <strong>{describe(op.operationId)}</strong>
            <p>Depende de: {op.predecessorIds.map(describe).join("; ")}</p>
            {graph.state === "insufficient"
              ? <p>Sequência não verificada devido a vínculos inconsistentes.</p>
              : op.blockingPredecessors.length
                ? <p className="evolu-dashboard__advanced-warning">Bloqueio confirmado na predecessora: {op.blockingPredecessors.map(describe).join("; ")}</p>
                : op.waitingOn.length
                  ? <p>Aguardando conclusão registrada de: {op.waitingOn.map(describe).join("; ")}. Isso não comprova gargalo.</p>
                  : <p>Predecessoras concluídas ou sucessora já concluída.</p>}
          </div>
        ))}
      {graph.independentIds.length > 0 &&
        <p className="evolu-dashboard__advanced-muted">
          {graph.independentIds.length} atividade(s) sem vínculo registrado, potencialmente paralelas. Nenhuma ordem artificial aplicada.
        </p>}
    </div>
  );
}

function AdvancedOrderRow({ assessment, source }: {
  assessment: AdvancedOrderAssessment;
  source: AdvancedSources;
}) {
  const { order, blocked, requirementWarnings, dependency } = assessment;
  return (
    <div className="evolu-dashboard__advanced-row">
      <div className="evolu-dashboard__advanced-row-head">
        <div className="min-w-0">
          <strong>{order.sale_number?.trim() ? "OS " + order.sale_number : "OS sem número"}</strong>
          <span className="mx-2 text-muted-foreground" aria-hidden="true">·</span>
          <span>{order.client_name?.trim() || "Cliente não informado"}</span>
          <p className="evolu-dashboard__advanced-muted">{order.title?.trim() || "Serviço não informado"}</p>
        </div>
        <Link href={"/os/" + encodeURIComponent(order.id)} className="evolu-dashboard__text-link">
          Abrir OS <ArrowRight aria-hidden="true" className="inline h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="evolu-dashboard__advanced-flags">
        <span>{blocked.length} operação(ões) bloqueada(s)</span>
        {requirementWarnings.length > 0 && <span>{requirementWarnings.length} exigência(s) ausente(s)</span>}
        {dependency.state === "available" && dependency.waitingCount > 0 &&
          <span>{dependency.waitingCount} dependência(s) aguardando</span>}
      </div>
      <details className="evolu-dashboard__advanced-details">
        <summary>Detalhar bloqueios, exigências e dependências</summary>
        <div className="space-y-3 pt-3">
          {blocked.length > 0
            ? <div className="space-y-1">
                <strong>Bloqueios confirmados</strong>
                {blocked.map(operation => <p key={operation.id} className="evolu-dashboard__advanced-warning">
                  {workCenterLabel(operation.work_center)}: {operation.blocked_reason?.trim() || "Motivo não registrado"}
                </p>)}
              </div>
            : <p className="evolu-dashboard__advanced-muted">Nenhuma operação com status de bloqueio confirmado entre os registros consultados.</p>}
          {assessment.ruleStatus === "unavailable"
            ? <p className="evolu-dashboard__advanced-muted">Exigências por etapa não configuradas ou indisponíveis; ausências de prazo e responsável não são consideradas infrações.</p>
            : requirementWarnings.length > 0
              ? requirementWarnings.map(message => <p key={message} className="evolu-dashboard__advanced-warning">{message}</p>)
              : <p className="evolu-dashboard__advanced-muted">Nenhuma ausência identificada segundo as exigências registradas para esta etapa.</p>}
          <div className="space-y-1">
            <strong>Dependências registradas</strong>
            <OperationDependencies row={assessment} source={source} />
          </div>
          <p className="evolu-dashboard__advanced-muted">
            <TimerOff aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
            {assessment.timingReason} Bloqueio registrado não equivale a gargalo confirmado.
          </p>
        </div>
      </details>
    </div>
  );
}

/** Lazy, RLS read-only advanced view. Never blocks the main dashboard. */
export function DashboardAdvancedPanel() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("attention");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestRef.current;
    setLoading(true); setError(""); setResult(null);
    try {
      const orders = await listDashboardOrders(controller.signal);
      const source = await listDashboardAdvancedSources(orders.map(order => order.id), controller.signal);
      if (controller.signal.aborted || id !== requestRef.current) return;
      setResult({ rows: buildAdvancedAssessments(orders, source), source });
    } catch (reason) {
      if (controller.signal.aborted || id !== requestRef.current) return;
      setError(reason instanceof Error ? reason.message : "Não foi possível verificar a análise avançada.");
    } finally {
      if (!controller.signal.aborted && id === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !userId) {
      abortRef.current?.abort();
      requestRef.current += 1;
      setResult(null);
      setError("");
      setLoading(false);
      return;
    }
    void load();
    return () => { abortRef.current?.abort(); requestRef.current += 1; };
  }, [open, userId, load]);

  const summary = result ? advancedSummary(result.rows) : null;
  const matching = result ? result.rows.filter(row => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (term && ![row.order.sale_number, row.order.client_name, row.order.title].join(" ").toLocaleLowerCase("pt-BR").includes(term)) return false;
    if (filter === "blocked") return row.confirmedBlockCount > 0;
    if (filter === "dependencies") return row.dependency.state !== "unavailable" && row.dependency.linkCount > 0;
    if (filter === "attention") return row.confirmedBlockCount > 0 ||
      row.requirementWarnings.length > 0 || row.dependency.waitingCount > 0;
    return true;
  }).sort((a,b) =>
    b.confirmedBlockCount - a.confirmedBlockCount ||
    b.requirementWarnings.length - a.requirementWarnings.length ||
    (a.order.delivery_date ?? "9999-12-31").localeCompare(b.order.delivery_date ?? "9999-12-31") ||
    a.order.id.localeCompare(b.order.id)
  ) : [];

  return (
    <section aria-labelledby="dashboard-advanced-heading" className="mt-5">
      <Card className="evolu-dashboard__panel">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle id="dashboard-advanced-heading" className="flex items-center gap-2 text-base">
                <GitBranch aria-hidden="true" className="h-5 w-5 text-primary" />
                Gargalos e dependências
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Bloqueios comprovados e vínculos registrados, sem estimar gargalos por volume ou tempo não confiável.
              </p>
            </div>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" disabled={!userId}>Consultar análise <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>Gargalos, regras e dependências</SheetTitle>
                  <SheetDescription>
                    Leitura atual das OS ativas acessíveis. Sem edição, alteração automática de prioridade ou mudança de prazos.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {loading ? "Consultando OS e atividades…" : result ? "Dados consultados" : "Consulta pendente"}
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={!userId || loading}>
                      <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Atualizar
                    </Button>
                  </div>
                  {loading && <p role="status" className="evolu-dashboard__advanced-muted">Carregando dados operacionais e verificando regras…</p>}
                  {error && <p role="alert" className="evolu-dashboard__agenda-error">Análise indisponível: {error}. Nenhum resultado parcial foi considerado confirmado.</p>}
                  {summary && result && <>
                    <div className="evolu-dashboard__advanced-summary">
                      <span><strong>{summary.orders}</strong> OS consultadas</span>
                      <span><strong>{summary.withConfirmedBlocks}</strong> OS com bloqueio confirmado</span>
                      <span><strong>{summary.withMissingRequirements}</strong> OS com exigências ausentes</span>
                      <span><strong>{summary.waitingSuccessors}</strong> atividades esperando predecessoras registradas</span>
                    </div>
                    {!summary.rulesAvailable && <p className="evolu-dashboard__advanced-notice">
                      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Regras Operacionais ainda não persistidas/configuradas. Sem limiares de tempo, não são calculados gargalos por duração nem alertas de exigências não cadastradas.
                    </p>}
                    {!summary.linksAvailable && <p className="evolu-dashboard__advanced-notice">
                      <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Ainda não há estrutura consultável de dependências; não é possível determinar predecessoras, sucessoras ou espera legítima.
                    </p>}
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar análise avançada">
                      {([
                        ["attention","Exigem atenção"],
                        ["blocked","Bloqueios"],
                        ["dependencies","Dependências"],
                        ["all","Todas as OS"],
                      ] as const).map(([value,label]) =>
                        <Button key={value} size="sm" type="button" variant={filter===value?"default":"outline"}
                          onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</Button>
                      )}
                    </div>
                    <Input type="search" aria-label="Buscar OS na análise avançada"
                      placeholder="Buscar número, cliente ou serviço" value={search} onChange={e=>setSearch(e.target.value)} />
                    <p aria-live="polite" className="evolu-dashboard__advanced-muted">
                      {matching.length} OS correspondem aos filtros; {Math.min(matching.length,60)} exibidas.
                    </p>
                    {matching.length === 0
                      ? <p className="evolu-dashboard__empty">
                          Nenhum registro confirmado corresponde ao filtro. Isso não confirma a inexistência de gargalos não mensuráveis.
                        </p>
                      : matching.slice(0,60).map(row =>
                        <AdvancedOrderRow key={row.order.id} assessment={row} source={result.source} />)}
                    {matching.length>60 && <p className="evolu-dashboard__advanced-muted">
                      {matching.length-60} OS adicionais. Refine a busca para consultá-las.
                    </p>}
                  </>}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardHeader>
        <CardContent>
          <p className="evolu-dashboard__advanced-muted">
            A análise detalhada carrega somente quando solicitada. Os alertas de bloqueio se baseiam no status registrado;
            tempos de parada e dependências exigem dados verificáveis.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
