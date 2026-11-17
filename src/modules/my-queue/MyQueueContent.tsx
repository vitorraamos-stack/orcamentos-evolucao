import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import type { MyQueueRow, QueuePeriod, QueueView } from "./myQueueModel";
import {
  isActionable, isOrderDeadlineRisk, isStageOverdue, queueMetrics, sortQueueRows,
} from "./myQueueModel";
import "./my-queue-content.css";

const PREVIEW_COUNT = 4;
type Metrics = ReturnType<typeof queueMetrics>;
type Props = {
  rows: MyQueueRow[];
  filtered: MyQueueRow[];
  metrics: Metrics;
  today: string;
  view: QueueView;
  search: string;
  sector: string;
  sectors: string[];
  period: QueuePeriod;
  page: number;
  pageCount: number;
  shown: MyQueueRow[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  busyId: string | null;
  updatedAt: Date | null;
  onView: (view: QueueView) => void;
  onSector: (sector: string) => void;
  onPeriod: (period: QueuePeriod) => void;
  onSearch: (search: string) => void;
  onPage: (page: number) => void;
  onRefresh: () => void;
  onExecute: (row: MyQueueRow) => void;
};

function toDateKey(value: string) {
  return new Date(value + "T12:00:00Z");
}

function tomorrowOf(dateKey: string) {
  const day = toDateKey(dateKey);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function dueLabel(value: string | null, today: string) {
  if (!value) return "Sem prazo";
  if (value === today) return "Hoje";
  if (value === tomorrowOf(today)) return "Amanhã";
  if (value === yesterdayOf(today)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(toDateKey(value)).replace(".", "");
}

function yesterdayOf(dateKey: string) {
  const day = toDateKey(dateKey);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function groupLabel(dateKey: string, today: string) {
  if (dateKey === today) return "HOJE";
  if (dateKey === tomorrowOf(today)) return "AMANHÃ";
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(toDateKey(dateKey)).replace(".", "").toUpperCase();
}

function activityHint(row: MyQueueRow) {
  if (row.status === "WAITING") return row.kind === "ART" ? "Aguardando aprovação" : "Aguardando retorno";
  if (row.status === "BLOCKED") return "Impedimento registrado";
  if (row.status === "DONE") return "Atividade concluída";
  if (row.kind === "ART") return row.status === "IN_PROGRESS" ? "Arte em andamento" : "Aguardando criação";
  if (row.status === "IN_PROGRESS") return "Em andamento";
  return row.sector;
}

function actionText(row: MyQueueRow) {
  switch (row.action) {
    case "START_ART": return "Criar arte";
    case "RETAKE_ART": return "Retomar";
    case "SEND_APPROVAL": return "Enviar aprovação";
    case "RELEASE_LAYOUT": return "Liberar";
    case "START_OPERATION": return "Iniciar";
    case "FINISH_OPERATION": return "Concluir";
    case "OPEN_PRODUCTION": return "Abrir produção";
    case "OPEN_INSTALLATION": return "Instalação";
    default: return "Abrir OS";
  }
}

function renderOsNumber(row: MyQueueRow) {
  return row.order.sale_number || row.order.os_number || "—";
}

function displayProduct(row: MyQueueRow) {
  return row.itemLabel || row.order.title || "Pedido sem descrição";
}

export default function MyQueueContent(props: Props) {
  const {
    rows, filtered, metrics, today, view, search, sector, sectors, period, page, pageCount,
    shown, loading, refreshing, error, busyId, updatedAt, onView, onSector, onPeriod,
    onSearch, onPage, onRefresh, onExecute,
  } = props;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [view, search, sector, period]);

  const visibleRows = expanded ? shown : filtered.slice(0, PREVIEW_COUNT);
  const waiting = useMemo(
    () => sortQueueRows(rows.filter(row => row.status === "WAITING"), today),
    [rows, today]
  );
  const nextGroups = useMemo(() => {
    const dates = new Map<string, number>();
    rows.filter(row => isActionable(row) && row.dueDate && row.dueDate >= today)
      .forEach(row => dates.set(row.dueDate!, (dates.get(row.dueDate!) ?? 0) + 1));
    return Array.from(dates.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3);
  }, [rows, today]);
  const dueToday = rows.filter(row => isActionable(row) && row.dueDate === today).length;

  const cards = [
    { title: "Minhas tarefas", value: metrics.pending, description: "Atribuídas à etapa atual",
      kind: "tasks", onClick: () => { onView("action"); onPeriod("all"); } },
    { title: "Atrasadas", value: metrics.overdue, description: "Precisam de atenção",
      kind: "late", onClick: () => { onView("action"); onPeriod("overdue"); } },
    { title: "Vencem hoje", value: dueToday, description: "Prazo de execução",
      kind: "today", onClick: () => { onView("action"); onPeriod("today"); } },
    { title: "Em espera", value: metrics.waiting, description: "Aguardando terceiros",
      kind: "waiting", onClick: () => { onView("waiting"); onPeriod("all"); } },
  ];

  function selectStage(next: string) {
    if (next === "__waiting" || next === "__done") {
      onSector("all");
      onView(next === "__waiting" ? "waiting" : "done");
      return;
    }
    onView("action");
    onSector(next);
  }

  const stageValue = view === "waiting" ? "__waiting" : view === "done" ? "__done" : sector;
  const title = view === "waiting" ? "Aguardando terceiros" :
    view === "done" ? "Atividades concluídas" : "Minhas próximas ações";
  const orderRisk = metrics.orderRisk;

  return (
    <div className="myq-page">
      <header className="myq-page__heading">
        <div className="myq-page__title-group">
          <p className="myq-page__eyebrow">ESPAÇO PESSOAL</p>
          <h1>Minha fila de trabalho</h1>
          <p className="myq-page__subtitle">Somente as etapas que precisam de uma ação sua, ordenadas por urgência.</p>
        </div>
        <button className="myq-page__study" type="button" disabled={refreshing || loading}
          onClick={onRefresh} title={updatedAt ? "Atualizado às " + updatedAt.toLocaleTimeString("pt-BR") : "Atualizar fila"}>
          {refreshing ? <LoaderCircle className="myq-spinner" size={13} /> : null}
          Atualizar
        </button>
      </header>

      <div className="myq-page__metrics" aria-label="Resumo das atividades">
        {cards.map(card =>
          <button key={card.kind} type="button" onClick={card.onClick}
            className={"myq-stat myq-stat--" + card.kind}
            aria-label={card.title + ": " + card.value}
            title={card.kind === "late" && orderRisk > 0 ?
              orderRisk + " atividade(s) possuem também prazo final da OS vencido (não contam como atraso da etapa)." : undefined}>
            <span className="myq-stat__label"><i aria-hidden="true" />{card.title}</span>
            <span className="myq-stat__bottom">
              <strong>{card.value}</strong><small>{card.description}</small>
            </span>
          </button>
        )}
      </div>

      {error && <div className="myq-page__error" role="alert">
        <span>Não foi possível atualizar a fila: {error}</span>
        <button type="button" onClick={onRefresh}>Tentar novamente</button>
      </div>}

      <div className="myq-page__body">
        <section className="myq-queue-card" aria-label="Minhas atividades">
          <div className="myq-queue-card__heading">
            <div>
              <h2>{title}</h2>
              <p>{view === "action" ? "Ordens com responsabilidade ativa nesta etapa" :
                view === "waiting" ? "Visíveis, mas fora da fila ativa" : "Histórico recente de execuções"}</p>
            </div>
            <button type="button" className="myq-queue-card__count"
              title={updatedAt ? "Atualizado às " + updatedAt.toLocaleTimeString("pt-BR") + " · Clique para atualizar" : "Atualizar"}
              aria-label="Atualizar fila de trabalho" disabled={refreshing || loading} onClick={onRefresh}>
              {refreshing ? <LoaderCircle size={13} className="myq-spinner" /> : null}
              {filtered.length} {view === "action" ? "abertas" : "atividades"}
            </button>
          </div>

          <div className="myq-queue-card__filters">
            <input aria-label="Buscar OS, cliente ou tarefa" value={search}
              onChange={event => onSearch(event.target.value)}
              placeholder="Buscar OS, cliente ou tarefa" />
            <select aria-label="Filtrar etapas" value={stageValue}
              onChange={event => selectStage(event.target.value)}>
              <option value="all">Etapas: todas</option>
              {sectors.map(value => <option key={value} value={value}>{value}</option>)}
              <option value="__waiting">Aguardando terceiros</option>
              <option value="__done">Concluídas</option>
            </select>
            <select aria-label="Filtrar prazo" value={period}
              onChange={event => onPeriod(event.target.value as QueuePeriod)}>
              <option value="all">Prazo: todos</option>
              <option value="overdue">Atrasadas</option>
              <option value="today">Vencem hoje</option>
              <option value="soon">Próximos 3 dias úteis</option>
            </select>
            <span className="myq-queue-card__view-label" aria-label="Visualização em lista">Lista</span>
          </div>

          <div className="myq-queue-card__table-wrap">
            {loading ? <div className="myq-queue-card__empty" role="status">
              <LoaderCircle size={20} className="myq-spinner" /> Carregando suas atividades...
            </div> : !visibleRows.length ? <div className="myq-queue-card__empty">
              <CheckCircle2 size={25} />
              {error ? "A fila não pôde ser carregada." : "Nenhuma atividade neste filtro."}
            </div> : <table className="myq-queue-table">
              <colgroup>
                <col className="myq-queue-table__col-os" />
                <col className="myq-queue-table__col-activity" />
                <col className="myq-queue-table__col-deadline" />
                <col className="myq-queue-table__col-priority" />
                <col className="myq-queue-table__col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th>ORDEM DE SERVIÇO</th><th>MINHA AÇÃO</th><th>PRAZO</th>
                  <th>PRIORIDADE</th><th><span className="sr-only">Ação</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const late = isStageOverdue(row, today);
                  const osRisk = isOrderDeadlineRisk(row, today);
                  const priorityHigh = row.urgent || late || osRisk;
                  return <tr key={row.id}>
                    <td>
                      <Link href={"/os/" + row.orderId} className="myq-os-link">OS #{renderOsNumber(row)}</Link>
                      <strong className="myq-row-product" title={displayProduct(row)}>{displayProduct(row)}</strong>
                      <span className="myq-row-secondary" title={row.order.client_name}>{row.order.client_name}</span>
                    </td>
                    <td>
                      <strong className="myq-row-action" title={row.activity}>{row.activity}</strong>
                      <span className="myq-row-secondary">{activityHint(row)}</span>
                    </td>
                    <td>
                      <span className={"myq-row-due " + (late || osRisk ? "myq-row-due--late" :
                        row.dueDate === today ? "myq-row-due--today" : "")}>
                        {dueLabel(row.dueDate, today)}
                        {late && " · atrasada"}
                        {osRisk && " · OS em risco"}
                      </span>
                      {row.dueKind === "order" && <span className="myq-row-secondary">Prazo final da OS</span>}
                    </td>
                    <td>
                      <span className={"myq-priority " + (priorityHigh ? "myq-priority--high" : "myq-priority--normal")}>
                        {priorityHigh ? "Alta" : "Normal"}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="myq-action-button" disabled={Boolean(busyId)}
                        onClick={() => onExecute(row)}>
                        {busyId === row.id ? <LoaderCircle size={14} className="myq-spinner" /> : null}
                        {actionText(row)}
                      </button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>}
          </div>

          <footer className="myq-queue-card__footer">
            <span>{visibleRows.length} de {filtered.length} tarefas mostradas</span>
            {!expanded && filtered.length > PREVIEW_COUNT ?
              <button type="button" className="myq-text-link" onClick={() => { setExpanded(true); onPage(1); }}>
                Ver todas <ArrowRight size={14} />
              </button> : expanded && pageCount > 1 ?
                <div className="myq-pagination">
                  <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
                  <span>{page} / {pageCount}</span>
                  <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Próxima</button>
                </div> : expanded ?
                  <button type="button" className="myq-text-link" onClick={() => setExpanded(false)}>Ver menos</button> :
                  <span className="myq-queue-card__footer-note">Atualização automática</span>}
          </footer>
        </section>

        <aside className="myq-page__sidebar" aria-label="Acompanhamentos e prazos">
          <section className="myq-side-card myq-side-card--waiting">
            <h2>Aguardando terceiros</h2>
            <p>Visíveis, mas fora da fila ativa</p>
            {waiting.length ? waiting.slice(0, 2).map((row, index) =>
              <Link key={row.id} className="myq-waiting-item" href={"/os/" + row.orderId}>
                <div className="myq-waiting-item__heading">
                  <span className={"myq-os-chip " + (index === 0 ? "myq-os-chip--amber" : "myq-os-chip--blue")}>
                    OS #{renderOsNumber(row)}
                  </span>
                  <strong title={displayProduct(row)}>{displayProduct(row)}</strong>
                </div>
                <small>{row.activity}</small>
              </Link>
            ) : <div className="myq-side-card__empty">Nenhuma atividade aguardando retorno.</div>}
            {waiting.length > 0 && <button type="button" className="myq-text-link"
              onClick={() => { onSector("all"); onView("waiting"); onPeriod("all"); }}>
              Ver {waiting.length} aguardando <ArrowRight size={14} />
            </button>}
          </section>

          <section className="myq-side-card myq-side-card--deadlines">
            <h2>Próximos prazos</h2>
            <p>O que vence em seguida</p>
            {nextGroups.length ? <div className="myq-next-groups">
              {nextGroups.map(([date, count], index) => <div className="myq-next-group" key={date}>
                <span className={"myq-date-chip myq-date-chip--" + (index === 0 ? "first" : index === 1 ? "second" : "third")}>
                  {groupLabel(date, today)}
                </span>
                <strong>{count} {count === 1 ? "atividade" : "atividades"}</strong>
              </div>)}
            </div> : <div className="myq-side-card__empty">Nenhum prazo próximo registrado.</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
