import { CalendarDays, MessageSquare, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { isOrderOverdue } from "@/modules/orders/risk";
import type { BoardCardModel, BoardStatus } from "@/shared/kanban/types";
import { getOperationalStatusLabel } from "@/shared/kanban/statusLabels";
import { formatArtworkDeadline, getArtworkCardDeadline } from "../presentation/artworkPresentation";

export function ArtworkQuickView({ card, open, canMove, moves, onOpenChange, onMove }: { card: BoardCardModel | null; open: boolean; canMove: boolean; moves: BoardStatus[]; onOpenChange: (open: boolean) => void; onMove: (status: BoardStatus) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full sm:max-w-md">{card && <>
    <SheetHeader><SheetTitle>OS #{card.order.os_number ?? card.order.sale_number}</SheetTitle><SheetDescription>{card.order.client_name} · {card.order.title || "Sem título"}</SheetDescription></SheetHeader>
    <div className="space-y-5 px-4"><div className="flex flex-wrap gap-2"><Badge>{getOperationalStatusLabel(card.order.art_status)}</Badge>{isOrderOverdue(card.order) && <Badge variant="destructive">Atrasada</Badge>}{isOrderUrgent(card.order) && <Badge variant="destructive">Urgente</Badge>}{card.order.art_direction_tag && card.order.art_direction_tag !== "URGENTE" && <Badge variant="secondary">{card.order.art_direction_tag === "CRIACAO_ARTE" ? "Criar arte" : "Arte pronta"}</Badge>}</div>
      <dl className="space-y-3 text-sm"><div className="flex gap-2"><UserRound className="h-4 w-4"/><div><dt className="text-muted-foreground">Responsável</dt><dd>{card.assignee?.name ?? "Sem responsável"}</dd></div></div><div className="flex gap-2"><CalendarDays className="h-4 w-4"/><div><dt className="text-muted-foreground">Prazo</dt><dd>{formatArtworkDeadline(getArtworkCardDeadline(card))}</dd></div></div><div><dt className="text-muted-foreground">Itens prontos</dt><dd>{card.itemsReady}/{card.itemsTotal}</dd></div>{card.commentsTotal > 0 && <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4"/>{card.commentsTotal} comentários</div>}<div><dt className="text-muted-foreground">Risco</dt><dd>{card.risk}</dd></div></dl>
      {canMove && moves.length > 0 && <div><label className="mb-1 block text-sm font-medium">Mover para</label><Select onValueChange={value => onMove(value as BoardStatus)}><SelectTrigger><SelectValue placeholder="Selecione a etapa"/></SelectTrigger><SelectContent>{moves.map(move => <SelectItem key={move} value={move}>{getOperationalStatusLabel(move)}</SelectItem>)}</SelectContent></Select></div>}
    </div><SheetFooter><Button asChild><Link href={`/os/${card.order.id}`}>Abrir OS completa</Link></Button></SheetFooter>
  </>}</SheetContent></Sheet>;
}
