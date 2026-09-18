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
  return (
    <Badge variant="secondary" className="max-w-44 truncate font-medium">
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
