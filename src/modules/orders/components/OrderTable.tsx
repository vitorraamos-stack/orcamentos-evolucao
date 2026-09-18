import { Link } from "wouter";
import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "../risk";
import {
  OrderPriorityBadge,
  OrderRiskBadge,
  OrderStatusBadge,
} from "@/shared/components/OrderBadges";
import { EmptyState } from "@/shared/components/OperationalUi";

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`))
    : "Sem prazo";

export function OrderTable({ orders }: { orders: OsOrder[] }) {
  if (!orders.length)
    return (
      <EmptyState
        title="Nenhuma OS encontrada"
        description="Ajuste os filtros ou a busca para visualizar outras ordens."
      />
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            {[
              "Número OS",
              "Cliente",
              "Título / serviço",
              "Etapa atual",
              "Prazo",
              "Prioridade",
              "Responsável",
              "Instalação",
              "Risco",
            ].map(label => (
              <th key={label} className="px-4 py-3 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const risk = calculateOrderRisk(order);
            return (
              <tr
                key={order.id}
                className="border-b last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 font-semibold">
                  <Link
                    href={`/os/${order.id}`}
                    className="text-primary hover:underline"
                  >
                    #{order.sale_number || order.os_number || "—"}
                  </Link>
                </td>
                <td className="max-w-48 truncate px-4 py-3">
                  {order.client_name}
                </td>
                <td className="max-w-56 truncate px-4 py-3">
                  {order.title || order.description || "Sem título"}
                </td>
                <td className="px-4 py-3">
                  <OrderStatusBadge
                    status={order.prod_status || order.art_status}
                  />
                </td>
                <td
                  className={
                    risk === "CRITICO"
                      ? "px-4 py-3 font-semibold text-red-700"
                      : "px-4 py-3"
                  }
                >
                  {date(order.delivery_date)}
                </td>
                <td className="px-4 py-3">
                  <OrderPriorityBadge
                    urgent={order.art_direction_tag === "URGENTE"}
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  Não atribuído
                </td>
                <td className="px-4 py-3">
                  {order.logistic_type === "instalacao"
                    ? date(order.delivery_date)
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <OrderRiskBadge risk={risk} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
