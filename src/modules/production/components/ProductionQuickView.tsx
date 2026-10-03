import { CalendarDays, MessageSquare, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { isOrderOverdue } from "@/modules/orders/risk";
import { WORK_CENTER_LABELS } from "@/modules/production/operations";
import type { BoardCardModel, BoardStatus } from "@/shared/kanban/types";
import { getOperationalStatusLabel } from "@/shared/kanban/statusLabels";
import {
  formatBlockedOperations,
  formatProductionDeadline,
  getProductionCardDeadline,
} from "../presentation/productionPresentation";

export function ProductionQuickView({
  card,
  open,
  canMove,
  moves,
  onOpenChange,
  onMove,
}: {
  card: BoardCardModel | null;
  open: boolean;
  canMove: boolean;
  moves: BoardStatus[];
  onOpenChange: (open: boolean) => void;
  onMove: (status: BoardStatus) => void;
}) {
  const centers = card
    ? Array.from(
        new Set([
          ...(card.activeWorkCenters ?? []),
          ...(card.operationWorkCenters ?? []),
        ])
      )
    : [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden sm:max-w-md">
        {card && (
          <>
            <SheetHeader className="shrink-0">
              <SheetTitle>
                OS #{card.order.os_number ?? card.order.sale_number}
              </SheetTitle>
              <SheetDescription>
                {card.order.client_name} · {card.order.title || "Sem título"}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
              <div className="flex flex-wrap gap-2">
                <Badge>
                  {getOperationalStatusLabel(
                    card.order.prod_status ?? "Produção"
                  )}
                </Badge>
                {isOrderOverdue(card.order) && (
                  <Badge variant="destructive">Atrasada</Badge>
                )}
                {isOrderUrgent(card.order) && (
                  <Badge variant="destructive">Urgente</Badge>
                )}
                {card.order.production_tag === "AGUARDANDO_INSUMOS" && (
                  <Badge variant="secondary">Aguardando insumos</Badge>
                )}
                {card.order.production_tag === "PRODUCAO_EXTERNA" && (
                  <Badge variant="secondary">Produção externa</Badge>
                )}
                {card.order.reproducao && (
                  <Badge variant="secondary">Reprodução</Badge>
                )}
                {card.order.letra_caixa && (
                  <Badge variant="secondary">Letra Caixa</Badge>
                )}
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <UserRound className="h-4 w-4" />
                  <div>
                    <dt className="text-muted-foreground">Responsável</dt>
                    <dd>{card.assignee?.name ?? "Sem responsável"}</dd>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <div>
                    <dt className="text-muted-foreground">Prazo</dt>
                    <dd>
                      {formatProductionDeadline(
                        getProductionCardDeadline(card)
                      )}
                    </dd>
                  </div>
                </div>
                <div>
                  <dt className="text-muted-foreground">Operações</dt>
                  <dd>
                    {card.productionOperationsCompleted ?? 0}/
                    {card.productionOperationsTotal ?? 0} operações concluídas
                  </dd>
                  {(card.productionOperationsBlocked ?? 0) > 0 && (
                    <dd className="text-destructive">
                      {formatBlockedOperations(
                        card.productionOperationsBlocked ?? 0
                      )}
                    </dd>
                  )}
                </div>
                {centers.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">
                      Centros de trabalho
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {centers.map(center => (
                        <Badge key={center} variant="outline">
                          {WORK_CENTER_LABELS[center]}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Itens prontos</dt>
                  <dd>
                    {card.itemsReady}/{card.itemsTotal}
                  </dd>
                </div>
                {card.commentsTotal > 0 && (
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {card.commentsTotal} comentários
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Risco</dt>
                  <dd>{card.risk}</dd>
                </div>
                {card.order.production_tag === "AGUARDANDO_INSUMOS" &&
                  card.order.insumos_details && (
                    <div>
                      <dt className="text-muted-foreground">Insumos</dt>
                      <dd className="whitespace-pre-wrap">
                        {card.order.insumos_details}
                      </dd>
                    </div>
                  )}
              </dl>
              {canMove && moves.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Mover para
                  </label>
                  <Select onValueChange={value => onMove(value as BoardStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {moves.map(move => (
                        <SelectItem key={move} value={move}>
                          {getOperationalStatusLabel(move)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <SheetFooter className="shrink-0">
              <Button asChild>
                <Link href={`/os/${card.order.id}`}>Abrir OS completa</Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
