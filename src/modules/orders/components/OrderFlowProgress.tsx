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

export function OrderFlowProgress({ order }: {
  order: Pick<OsOrder, "art_status" | "prod_status" | "archived">;
}) {
  const current = stages.findIndex(stage => stage.value === getOrderOperationalStage(order));
  const currentStage = stages[current];
  return (
    <section aria-label="Progresso operacional" className="evolu-detail__flow">
      <div className="evolu-detail__section-heading">
        <div>
          <h2>Fluxo operacional</h2>
          <p>Posição atual do pedido. Etapas anteriores não representam conclusão comprovada.</p>
        </div>
        {currentStage && <span className="evolu-detail__current-stage">
          Etapa {current + 1} de {stages.length}: {currentStage.label}
        </span>}
      </div>
      <div className="evolu-detail__flow-scroll overflow-x-auto" role="region" tabIndex={0} aria-label="Etapas operacionais">
        <ol className="evolu-detail__stage-list flex min-w-[760px] items-start">
          {stages.map((stage, index) => {
            const isCurrent = index === current;
            const isEarlier = current >= 0 && index < current;
            return <li key={stage.value} className="evolu-detail__stage flex flex-1 items-start last:flex-none">
              <div className="evolu-detail__stage-content flex w-20 flex-col items-center text-center">
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={stage.label + (isCurrent ? ", etapa atual" : isEarlier ? ", etapa anterior" : ", etapa posterior")}
                  className={cn(
                    "evolu-detail__stage-bubble flex size-9 items-center justify-center rounded-full border text-xs font-bold",
                    isCurrent ? "evolu-detail__stage-bubble--current"
                      : isEarlier ? "evolu-detail__stage-bubble--earlier"
                        : "evolu-detail__stage-bubble--pending"
                  )}
                >{index + 1}</span>
                <span className={cn("evolu-detail__stage-label mt-2 text-xs", isCurrent && "font-bold")}>{stage.label}</span>
              </div>
              {index < stages.length - 1 && <span aria-hidden="true" className="evolu-detail__stage-line mt-[18px] h-0.5 flex-1 bg-border" />}
            </li>;
          })}
        </ol>
      </div>
    </section>
  );
}
