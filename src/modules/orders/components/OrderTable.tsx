import type { MouseEvent } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  Eye,
  MapPin,
  MoreHorizontal,
  Package,
  Truck,
} from "lucide-react";
import type { OsOrder } from "@/features/hubos/types";
import type { OperationalOrder, OperationalOrderItem } from "../orderRepository";
import { calculateOrderRisk } from "../risk";
import { isSameTabOrderActivation } from "../centralReturnContext";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

function formatOrderItemQuantity(item: OperationalOrderItem) {
  const unit = item.unit?.trim() || "un";
  const normalizedUnit = /^(un|un\.|unid|unidade|unidades)$/i.test(unit) ? "un." : unit;
  return quantityFormatter.format(Number(item.quantity)) + " " + normalizedUnit;
}

/** The list stays one item tall; the extras are only revealed on demand. */
function OrderServicePreview({
  order,
  mobile = false,
}: {
  order: OperationalOrder;
  mobile?: boolean;
}) {
  const firstItem = order.items[0];
  const remainingItems = order.items.slice(1);
  const fallback = order.title || order.description || "Serviço não informado";

  return (
    <div className="min-w-0">
      {firstItem ? (
        <div className="flex min-w-0 items-baseline gap-1.5 font-semibold">
          <span
            className={cn("min-w-0", mobile ? "line-clamp-2" : "truncate")}
            title={firstItem.name}
          >
            {firstItem.name}
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            — {formatOrderItemQuantity(firstItem)}
          </span>
        </div>
      ) : (
        <p className={cn("font-semibold", mobile ? "line-clamp-2" : "truncate")} title={fallback}>
          {fallback}
        </p>
      )}
      {!firstItem && !mobile && order.title && order.description && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={order.description}>
          {order.description}
        </p>
      )}
      {remainingItems.length > 0 && (
        <div className="mt-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={"Visualizar " + remainingItems.length + (remainingItems.length === 1 ? " outro item do pedido" : " outros itens do pedido")}
                title={remainingItems.map(item => item.name + " — " + formatOrderItemQuantity(item)).join("\n")}
              >
                +{remainingItems.length} {remainingItems.length === 1 ? "item" : "itens"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-80 max-w-[calc(100vw-2rem)] p-3">
              <p className="text-xs font-semibold text-muted-foreground">Outros itens do pedido</p>
              <ul className="mt-2 space-y-2">
                {remainingItems.map(item => (
                  <li key={item.id} className="flex items-start gap-3 text-sm">
                    <span className="min-w-0 flex-1 break-words">{item.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                      {formatOrderItemQuantity(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

export function OrderTable({
  orders,
  onClearFilters,
  onOpenOrder,
  highlightOrderId,
}: {
  orders: OperationalOrder[];
  onClearFilters?: () => void;
  onOpenOrder?: (orderId: string) => void;
  highlightOrderId?: string | null;
}) {
  const handleOrderLink = (event: MouseEvent<HTMLAnchorElement>, orderId: string) => {
    if (isSameTabOrderActivation(event.nativeEvent)) onOpenOrder?.(orderId);
  };
  if (!orders.length)
    return (
      <div className="rounded-xl border bg-card py-4 shadow-xs">
        <EmptyState
          title="Nenhuma ordem encontrada."
          description={onClearFilters
            ? "Nenhuma OS corresponde à pesquisa ou aos filtros aplicados. Remova um critério ou tente outra busca."
            : "Não há ordens de serviço disponíveis nesta consulta."}
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
    <div className="evolu-orders__results">
      <div className="evolu-orders__mobile-list lg:hidden" aria-label="Lista de ordens de serviço">
        {orders.map(order => {
          const risk = calculateOrderRisk(order);
          const path = `/os/${order.id}`;
          const number = order.sale_number;
          const numberLabel = number ? `#${number}` : "Número não informado";
          return (
            <article key={order.id} className={cn("evolu-orders__mobile-card", highlightOrderId === order.id && "ring-2 ring-primary/50")}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={path} data-central-order-id={order.id} onClick={event => handleOrderLink(event, order.id)} className="text-base font-extrabold text-primary hover:underline">
                    {numberLabel}
                  </Link>
                  <p className="mt-1 truncate text-sm font-semibold" title={order.client_name}>
                    {order.client_name || "Cliente não informado"}
                  </p>
                </div>
                <OrderRiskBadge risk={risk} />
              </div>
              <div className="mt-3 text-sm text-foreground">
                <OrderServicePreview order={order} mobile />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={order.prod_status || order.art_status} />
                <OrderPriorityBadge urgent={isOrderUrgent(order)} />
                <OrderLogisticsCell type={order.logistic_type} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-xs",
                  risk === "CRITICO" ? "font-bold text-destructive" : "text-muted-foreground"
                )}>
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {date(order.delivery_date)}
                </span>
                <Link
                  href={path}
                  onClick={event => handleOrderLink(event, order.id)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={number ? `Visualizar OS ${number}` : "Visualizar OS sem número informado"}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" /> Visualizar OS
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      <div className="evolu-orders__desktop-table hidden overflow-x-auto rounded-xl border bg-card shadow-xs lg:block">
        <table className="w-full min-w-[760px] table-fixed text-sm xl:min-w-0">
          <caption className="sr-only">Ordens de Serviço — relação de resultados</caption>
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[34%]" />
            <col className="w-[23%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b bg-muted/90 text-left text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              {["OS / Cliente", "Serviço", "Etapa", "Prazo", "Ações"].map(label => (
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(order => {
              const risk = calculateOrderRisk(order);
              const path = `/os/${order.id}`;
              const number = order.sale_number;
              const numberLabel = number ? `#${number}` : "Número não informado";
              return (
                <tr
                  key={order.id}
                  className={cn(
                    "border-b transition-colors last:border-0 hover:bg-muted/30",
                    risk === "CRITICO" && "border-l-2 border-l-destructive bg-destructive/[0.025]",
                    highlightOrderId === order.id && "bg-primary/10 ring-2 ring-inset ring-primary/40"
                  )}
                >
                  <td className="min-w-0 px-4 py-3 align-top">
                    <Link
                      href={path}
                      data-central-order-id={order.id}
                      onClick={event => handleOrderLink(event, order.id)}
                      className="inline-flex rounded-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {numberLabel}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={order.client_name}>
                      {order.client_name || "Cliente não informado"}
                    </p>
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top">
                    <OrderServicePreview order={order} />
                    <div className="mt-2">
                      <OrderLogisticsCell type={order.logistic_type} />
                    </div>
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <OrderStatusBadge status={order.prod_status || order.art_status} />
                      <OrderPriorityBadge urgent={isOrderUrgent(order)} />
                      <OrderRiskBadge risk={risk} />
                    </div>
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-3 align-top",
                      !order.delivery_date && "text-muted-foreground",
                      risk === "ATENCAO" && "font-medium text-amber-700",
                      risk === "CRITICO" && "font-semibold text-destructive"
                    )}
                  >
                    {date(order.delivery_date)}
                  </td>
                  <td className="px-1 py-2.5 align-top">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              href={path}
                              onClick={event => handleOrderLink(event, order.id)}
                              aria-label={number ? `Visualizar OS ${number}` : "Visualizar OS sem número informado"}
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
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
                            aria-label={number ? `Ações da OS ${number}` : "Ações da OS sem número informado"}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={path} onClick={event => handleOrderLink(event, order.id)}>Abrir OS</Link>
                          </DropdownMenuItem>
                          {number && (
                            <DropdownMenuItem
                              onClick={() => navigator.clipboard?.writeText(String(number))}
                            >
                              Copiar número da OS
                            </DropdownMenuItem>
                          )}
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
    </div>
  );
}
