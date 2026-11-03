import { cn } from "@/lib/utils";
import type { OsOrder } from "@/features/hubos/types";
import { getOrderOperationalStage } from "../services/orderTransitions";
import type { OperationalStage } from "../types/orderDetail";

const stages: { value: OperationalStage; label: string }[] = [
  { value: "ENTRY", label: "Entrada" },
  { value: "ART", label: "Arte" },
  { value: "APPROVAL", label: "Aprovação" },
  { value: "PRODUCTION", label: "Produção" },
  { value: "FINISHING", label: "Acabamento" },
  { value: "READY", label: "Material pronto" },
  { value: "LOGISTICS", label: "Instalação / Entrega" },
  { value: "FINISHED", label: "Finalizado" },
];

export function OrderFlowProgress({
  order,
}: {
  order: Pick<OsOrder, "art_status" | "prod_status" | "archived">;
}) {
  const current = stages.findIndex(stage => stage.value === getOrderOperationalStage(order));
  const currentStage = stages[current];
  return (
    <section aria-label="Progresso operacional" className="evolu-detail__flow">
      <div className="evolu-detail__section-heading">
        <div>
          <h2>Fluxo operacional</h2>
          <p>Posição atual no fluxo. Etapas anteriores não significam conclusão confirmada.</p>
        </div>
        {currentStage && <span className="evolu-detail__current-stage">
          Etapa {current + 1} de {stages.length}: {currentStage.label}
        </span>}
      </div>
      <div className="evolu-detail__flow-scroll overflow-x-auto" role="region" aria-label="Etapas ���q�^