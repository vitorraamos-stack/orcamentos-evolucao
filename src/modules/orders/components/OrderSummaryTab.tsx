import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OsOrder } from "@/features/hubos/types";

const field = (label: string, value: React.ReactNode) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
      {value || "—"}
    </dd>
  </div>
);

export function OrderSummaryTab({ order }: { order: OsOrder }) {
  // The header already provides the client, OS number, title, current stage,
  // priority, contracted deadline, general assignee and logistics.
  const showAddress =
    order.logistic_type !== "retirada" || Boolean(order.address?.trim());

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Informações complementares</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {field("Número da venda", order.sale_number)}
          {field(
            "Criada em",
            new Date(order.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })
          )}
          {showAddress && field("Endereço do serviço", order.address)}
          {order.insumos_details?.trim() &&
            field("Observações de insumos", order.insumos_details)}
          {order.insumos_return_notes?.trim() &&
            field("Retorno de insumos", order.insumos_return_notes)}
          {order.production_tag === "PRODUCAO_EXTERNA" &&
            field("Produção externa", "Sim")}
        </dl>
      </CardContent>
    </Card>
  );
}
