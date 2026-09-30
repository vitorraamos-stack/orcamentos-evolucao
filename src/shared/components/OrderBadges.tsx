import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderRisk } from "@/modules/orders/risk";

const riskStyles: Record<OrderRisk, string> = {
  NORMAL: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ATENCAO: "border-amber-200 bg-amber-50 text-amber-800",
  CRITICO: "border-red-200 bg-red-50 text-red-700",
};

export function OrderRiskBadge({ risk }: { risk: OrderRisk }) {
  return (
    <Badge variant="outline" className={cn("font-semibold", riskStyles[risk])}>
      {risk === "ATENCAO" ? "ATENÇÃO" : risk}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status?: string | null }) {
  const statusStyles: Record<string, string> = {
    "Caixa de Entrada": "border-slate-200 bg-slate-50 text-slate-700",
    "Fila de Arte": "border-sky-200 bg-sky-50 text-sky-700",
    "Em Criação": "border-blue-200 bg-blue-50 text-blue-700",
    "Para Aprovação": "border-violet-200 bg-violet-50 text-violet-700",
    Ajustes: "border-amber-200 bg-amber-50 text-amber-800",
    Produzir: "border-indigo-200 bg-indigo-50 text-indigo-700",
    Produção: "border-indigo-200 bg-indigo-50 text-indigo-700",
    "Em Acabamento": "border-orange-200 bg-orange-50 text-orange-700",
    "Pronto / Avisar Cliente":
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    "Logística (Entrega/Transportadora)":
      "border-cyan-200 bg-cyan-50 text-cyan-700",
    "Instalação Agendada": "border-purple-200 bg-purple-50 text-purple-700",
    Finalizados: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-44 truncate font-medium",
        statusStyles[status || ""] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status || "Entrada"}
    </Badge>
  );
}

export function OrderPriorityBadge({ urgent }: { urgent?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        urgent
          ? "border-red-200 bg-red-50 text-red-700"
          : "text-muted-foreground"
      }
    >
      {urgent ? "Urgente" : "Normal"}
    </Badge>
  );
}
