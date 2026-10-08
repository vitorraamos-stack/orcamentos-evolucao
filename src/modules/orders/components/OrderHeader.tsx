import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OsOrder, ArtStatus, ProdStatus } from "@/features/hubos/types";
import { getOperationalStatusLabel } from "@/shared/kanban/statusLabels";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import { calculateOrderRisk } from "../risk";
import type { OrderAssignee } from "../types/orderDetail";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, ChevronDown, MapPinned, Pencil, UserRound } from "lucide-react";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { OrderActionsMenu } from "./OrderActionsMenu";

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value + "T12:00:00-03:00"))
    : "Não definido";

const logistics = {
  retirada: "Retirada",
  entrega: "Entrega",
  instalacao: "Instalação",
} as const;

export function OrderHeader({
  order, assignees, canEdit, transitions, onEdit, onTransition,
  canManage = false, onArchive, onDelete,
}: {
  order: OsOrder;
  assignees: OrderAssignee[];
  canEdit: boolean;
  transitions: { board: "art" | "production"; value: ArtStatus | ProdStatus }[];
  onEdit: () => void;
  canManage?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onTransition: (board: "art" | "production", value: ArtStatus | ProdStatus) => void;
}) {
  const general =
    assignees.find(item => item.scope === "GENERAL")?.user?.name ??
    "Não definido";

  return (
    <header className="evolu-detail__hero">
      <div className="evolu-detail__hero-main">
        <div className="min-w-0 flex-1">
          <p className="evolu-detail__eyebrow">
            <span className="evolu-detail__eyebrow-line" aria-hidden="true" />
            Ordem de serviço
          </p>
          <p className="evolu-detail__number">
            OS #{order.os_number ?? order.sale_number}
          </p>
          <h1 className="evolu-detail__client break-words">
            {order.client_name}
          </h1>
          <p className="evolu-detail__service break-words">
            {order.title || order.description || "Sem título"}
          </p>
          <div className="evolu-detail__badges flex flex-wrap items-center gap-2">
            <Badge>{getOperationalStatusLabel(order.prod_status || order.art_status)}</Badge>
            {isOrderUrgent(order) && <Badge variant="destructive">Urgente</Badge>}
            <OrderRiskBadge risk={calculateOrderRisk(order)} />
          </div>
        </div>
        <div className="evolu-detail__actions flex flex-wrap items-center gap-2">
          {transitions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="evolu-detail__transition-button">
                  Alterar etapa <ChevronDown className="ml-1 size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {transitions.map(option => (
                  <DropdownMenuItem
                    key={option.board + "-" + option.value}
                    onClick={() => onTransition(option.board, option.value)}
                  >
                    Mover para {getOperationalStatusLabel(option.value)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && (
            <Button className="evolu-detail__edit-button" onClick={onEdit}>
              <Pencil className="size-4" aria-hidden="true" /> Editar OS
            </Button>
          )}
          {canManage && onArchive && onDelete && (
            <OrderActionsMenu onArchive={onArchive} onDelete={onDelete} />
          )}
        </div>
      </div>
      <dl className="evolu-detail__quick-info">
        <div className="evolu-detail__quick-info-item">
          <span className="evolu-detail__quick-info-icon" aria-hidden="true">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0">
            <dt>Prazo final</dt>
            <dd>{date(order.delivery_date)}</dd>
          </div>
        </div>
        <div className="evolu-detail__quick-info-item">
          <span className="evolu-detail__quick-info-icon" aria-hidden="true">
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            <dt>Responsável geral</dt>
            <dd title={general}>{general}</dd>
          </div>
        </div>
        <div className="evolu-detail__quick-info-item">
          <span className="evolu-detail__quick-info-icon" aria-hidden="true">
            <MapPinned className="size-5" />
          </span>
          <div className="min-w-0">
            <dt>Logística</dt>
            <dd>{logistics[order.logistic_type]}</dd>
          </div>
        </div>
      </dl>
    </header>
  );
}
