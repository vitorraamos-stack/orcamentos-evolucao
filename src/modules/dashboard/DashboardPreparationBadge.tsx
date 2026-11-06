import { AlertTriangle, CheckCircle2, CircleHelp, Layers3 } from "lucide-react";
import { assessCommitment, type OrderPreparation } from "./dashboardPreparation";
import type { AgendaEvent } from "./dashboardAgenda";

const labels = {
  pending: "Pendente",
  partial: "Parcial",
  unverified: "Não verificada",
};
const productionLabels = {
  ready: "Pronta", partial: "Parcial", pending: "Pendente", unverified: "Não verificada",
};

export function PreparationBadge({
  preparation, event, leadHours = 48, now = new Date(),
}: {
  preparation: OrderPreparation | null | undefined;
  event?: AgendaEvent;
  leadHours?: number;
  now?: Date;
}) {
  if (!preparation) {
    return <span className="evolu-dashboard__prep-muted" role="status">Prontidão: consultando…</span>;
  }
  const alert = event ? assessCommitment(event, preparation, now, leadHours) : null;
  const Icon = preparation.combined === "pending" ? AlertTriangle :
    preparation.production === "ready" ? CheckCircle2 : CircleHelp;
  const details = [
    ...(alert?.additionalAlerts ?? []),
    ...(event?.warnings ?? []),
    ...preparation.reasons,
  ];
  return (
    <div className="evolu-dashboard__prep" data-preparation={preparation.combined}>
      <span className="evolu-dashboard__prep-title">
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        Prontidão: {labels[preparation.combined]}
      </span>
      <span className="evolu-dashboard__prep-muted">
        Produção {productionLabels[preparation.production].toLowerCase()} · Materiais {preparation.materials === "pending" ? "pendentes" : "não verificados"}
      </span>
      {alert?.primaryAlert &&
        <span className="evolu-dashboard__prep-main-alert">
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {alert.primaryAlert}
        </span>}
      <details className="evolu-dashboard__prep-details">
        <summary>Ver detalhes da preparação</summary>
        <p>
          <Layers3 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
          {preparation.readyItems} de {preparation.totalItems} item(ns) prontos ·
          {" "}{preparation.completedOperations} de {preparation.requiredOperations} operações obrigatórias concluídas
        </p>
        {details.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {Array.from(new Set(details)).map(reason => <li key={reason}>{reason}</li>)}
        </ul>}
        <p className="mt-1">Consulta informativa. Não há reserva de materiais comprovada por este painel.</p>
      </details>
    </div>
  );
}
