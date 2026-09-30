import { Link } from "wouter";
import {
  AlertTriangle,
  Eye,
  MapPin,
  MoreHorizontal,
  Package,
  Truck,
  UserRound,
} from "lucide-react";
import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "../risk";
import {
  OrderPriorityBadge,
  OrderRiskBadge,
  OrderStatusBadge,
} from "@/shared/components/OrderBadges";
import { EmptyState } from "@/shared/components/OperationalUi";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`))
    : "Sem prazo";

const logistics = {
  retirada: { label: "Retirada", icon: Package },
  entrega: { label: "Entrega", icon: Truck },
  instalacao: { label: "Instalação", icon: MapPin },
} as const;

export function OrderLogisticsCell({
  type,
}: {
  type: OsOrder["logistic_type"];
}) {
  const item = logistics[type];
  const Icon = item.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {item.label}
    </span>
  );
}

export function OrderTable({
  orders,
  onClearFilters,
}: {
  orders: OsOrder[];
  onClearFilters?: () => void;
}) {
  if (!orders.length)
    return (
      <div className="rounded-xl border bg-card py-4 shadow-xs">
        <EmptyState
          title="Nenhuma ordem encontrada."
          description="Revise os filtros ou tente outra busca."
        />
        {onClearFilters && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Limpar filtros
            </Button>
          </div>
        )}
      </div>
    );
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full min-w-[1120px] text-sm">
        <thead className="sticky top-0 z-10 border-b bg-muted/90 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            {[
              "OS",
              "Cliente",
              "Título / serviço",
              "Etapa atual",
              "Prazo",
              "Prioridade",
              "Responsável",
              "Logística",
              "Risco",
              "Ações",
            ].map(label => (
              <th
                key={label}
                className="whitespace-nowrap px-3 py-3 font-semibold"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const risk = calculateOrderRisk(order);
            const path = `/os/${order.id}`;
            return (
              <tr
                key={order.id}
                className={cn(
                  "border-b transition-colors last:border-0 hover:bg-muted/30",
                  risk === "CRITICO" &&
                    "border-l-2 border-l-destructive bg-destructive/[0.025]"
                )}
              >
                <td className="px-3 py-3 font-semibold tabular-nums">
                  <Link
                    href={path}
                    className="whitespace-nowrap text-primary underline-offset-4 hover:underline"
                  >
                    #{order.sale_number || order.os_number || "—"}
                  </Link>
                </td>
                <td
                  className="max-w-44 truncate px-3 py-3 font-medium"
                  title={order.client_name}
                >
                  {order.client_name}
                </td>
                <td className="max-w-56 px-3 py-3">
                  <p
                    className="truncate font-medium"
                    title={order.title || order.description || "Sem título"}
                  >
                    {order.title || order.description || "Sem título"}
                  </p>
                  {order.title && order.description && (
                    <p
                      className="max-w-52 truncate text-xs text-muted-foreground"
                      title={order.description}
                    >
                      {order.description}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <OrderStatusBadge
                    status={order.prod_status || order.art_status}
                  />
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-3",
                    !order.delivery_date && "text-muted-foreground",
                    risk === "ATENCAO" && "font-medium text-amber-700",
                    risk === "CRITICO" && "font-semibold text-destructive"
                  )}
                >
                  {date(order.delivery_date)}
                </td>
                <td className="px-3 py-3">
                  <OrderPriorityBadge urgent={isOrderUrgent(order)} />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex whitespace-nowrap items-center gap-1.5 text-muted-foreground">
                    <span className="rounded-full bg-muted p-1">
                      <UserRound className="h-3 w-3" aria-hidden="true" />
                    </span>
                    Sem responsável
                  </span>
                </td>
                <td className="px-3 py-3">
                  <OrderLogisticsCell type={order.logistic_type} />
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1">
                    {risk === "CRITICO" && (
                      <AlertTriangle
                        className="h-4 w-4 text-destructive"
                        aria-hidden="true"
                      />
                    )}
                    <OrderRiskBadge risk={risk} />
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            href={path}
                            aria-label={`Visualizar OS ${order.sale_number || order.os_number}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Visualizar</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações da OS ${order.sale_number || order.os_number}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={path}>Abrir OS</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            navigator.clipboard?.writeText(
                              order.sale_number || String(order.os_number || "")
                            )
                          }
                        >
                          Copiar número da OS
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
