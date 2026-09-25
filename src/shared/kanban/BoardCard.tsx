import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "wouter";
import {
  CalendarDays,
  MessageSquare,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardCardModel, BoardKind, BoardStatus } from "./types";
import { formatDatePtBr } from "@/features/hubos/deliveryDeadline";

const TAGS: Record<string, string> = {
  URGENTE: "Urgente",
  ARTE_PRONTA_EDICAO: "Arte pronta",
  CRIACAO_ARTE: "Criar arte",
  AGUARDANDO_INSUMOS: "Aguardando insumos",
  PRODUCAO_EXTERNA: "Produção externa",
  EM_PRODUCAO: "Em produção",
  PRONTO: "Pronto",
};

export function BoardCard({
  card,
  board,
  moves,
  canMove,
  isManager,
  onMove,
  onTag,
  onReturn,
}: {
  card: BoardCardModel;
  board: BoardKind;
  moves: BoardStatus[];
  canMove: boolean;
  isManager: boolean;
  onMove: (status: BoardStatus) => void;
  onTag?: () => void;
  onReturn?: () => void;
}) {
  const drag = useDraggable({
    id: card.order.id,
    disabled: !canMove,
    data: { card },
  });
  const style = {
    transform: CSS.Translate.toString(drag.transform),
    opacity: drag.isDragging ? 0.45 : 1,
  };
  const deadline = card.deadlines.find(item =>
    board === "art"
      ? ["ART", "APPROVAL"].includes(item.scope)
      : ["PRODUCTION", "FINISHING"].includes(item.scope)
  );
  const badges = [
    card.risk === "CRITICO" ? "Atrasado" : null,
    TAGS[
      board === "art"
        ? (card.order.art_direction_tag ?? "")
        : (card.order.production_tag ?? "")
    ],
    board === "production" && card.order.reproducao ? "Reprodução" : null,
    board === "production" && card.order.letra_caixa ? "Letra Caixa" : null,
  ]
    .filter(Boolean)
    .slice(0, 4);
  return (
    <Card
      ref={drag.setNodeRef}
      style={style}
      {...drag.listeners}
      {...drag.attributes}
      className="space-y-3 p-3 shadow-sm transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            OS #{card.order.os_number ?? card.order.sale_number}
          </p>
          <Link href={`/os/${card.order.id}`}>
            <a className="block truncate font-semibold hover:underline">
              {card.order.client_name}
            </a>
          </Link>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {card.order.title || "Sem título"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onPointerDown={event => event.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Link href={`/os/${card.order.id}`}>
              <DropdownMenuItem>Abrir OS</DropdownMenuItem>
            </Link>
            {board === "production" && onTag && (
              <DropdownMenuItem onClick={onTag}>
                Tag de Produção
              </DropdownMenuItem>
            )}
            {board === "production" && isManager && onReturn && (
              <DropdownMenuItem onClick={onReturn}>
                Voltar para Arte
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap gap-1">
        {badges.map(badge => (
          <Badge
            key={badge}
            variant={
              badge === "Atrasado" || badge === "Urgente"
                ? "destructive"
                : "secondary"
            }
            className="text-[10px]"
          >
            {badge}
          </Badge>
        ))}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {deadline
            ? `Etapa ${formatDatePtBr(deadline.dueDate)}`
            : `Prazo ${formatDatePtBr(card.order.delivery_date)}`}
        </span>
        <span className="flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" />
          {card.assignee?.name ?? "Sem responsável"}
        </span>
        <span>
          {card.itemsReady}/{card.itemsTotal} itens prontos{" "}
          {card.commentsTotal > 0 && (
            <>
              <MessageSquare className="ml-2 inline h-3.5 w-3.5" />{" "}
              {card.commentsTotal}
            </>
          )}
        </span>
      </div>
      {canMove && moves.length > 0 && (
        <Select onValueChange={value => onMove(value as BoardStatus)}>
          <SelectTrigger className="h-8 md:hidden">
            <SelectValue placeholder="Mover para..." />
          </SelectTrigger>
          <SelectContent>
            {moves.map(move => (
              <SelectItem key={move} value={move}>
                {move}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Card>
  );
}
