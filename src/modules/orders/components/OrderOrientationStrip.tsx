import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OsOrder } from "@/features/hubos/types";
import { getOrderOperationalStage } from "../services/orderTransitions";

const labels: Record<string, string> = {
  ENTRY: "Entrada", ART: "Arte", APPROVAL: "Aprovação",
  PRODUCTION: "Produção", FINISHING: "Acabamento", READY: "Material pronto",
  LOGISTICS: "Instalação / Entrega", FINISHED: "Finalizado",
};

export function OrderOrientationStrip({ order, onGoProduction }: {
  order: Pick<OsOrder, "art_status" | "prod_status" | "archived">;
  onGoProduction: () => void;
}) {
  const stage = getOrderOperationalStage(order);
  return <section aria-label="Orientação da OS"
    className="evolu-detail__orientation flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
    <Info className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <h2 className="text-sm font-semibold">Acompanhamento operacional</h2>
      <p className="mt-1 break-words text-xs text-muted-foreground">
        {labels[stage] ? "Etapa atual registrada: " + labels[stage] + ". " : "Etapa atual não informada. "}
        Consulte as operações de Produção para verificar tarefas e responsáveis. Nenhuma tarefa foi presumida.
      </p>
    </div>
    <Button type="button" variant="outline" className="min-h-11" onClick={onGoProduction}>
      Consultar produção <ArrowRight className="ml-2 size-4" aria-hidden="true" />
    </Button>
  </section>;
}
