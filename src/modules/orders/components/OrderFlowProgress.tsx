import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OsOrder } from "@/features/hubos/types";
import { getOrderOperationalStage } from "../services/orderTransitions";
import type { OperationalStage } from "../types/orderDetail";

const stages: { value: OperationalStage; label: string }[] = [
  { value: "ENTRY", label: "Entrada" }, { value: "ART", label: "Arte" }, { value: "APPROVAL", label: "Aprovação" },
  { value: "PRODUCTION", label: "Produção" }, { value: "FINISHING", label: "Acabamento" }, { value: "READY", label: "Material pronto" },
  { value: "LOGISTICS", label: "Instalação / Entrega" }, { value: "FINISHED", label: "Finalizado" },
];
export function OrderFlowProgress({ order }: { order: Pick<OsOrder, "art_status" | "prod_status" | "archived"> }) {
  const current = stages.findIndex(stage => stage.value === getOrderOperationalStage(order));
  return <section aria-label="Progresso operacional" className="overflow-x-auto rounded-xl border bg-card p-4">
    <ol className="flex min-w-[760px] items-start">{stages.map((stage, index) => <li key={stage.value} className="flex flex-1 items-start last:flex-none">
      <div className="flex w-20 flex-col items-center text-center"><span className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold", index <= current ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}>{index < current ? <Check className="h-4 w-4" /> : index + 1}</span><span className="mt-2 text-xs">{stage.label}</span></div>
      {index < stages.length - 1 && <span className={cn("mt-4 h-0.5 flex-1", index < current ? "bg-primary" : "bg-border")} />}
    </li>)}</ol>
  </section>;
}

