import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, RefreshCw, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  listArtworkAssignees,
  listArtworkBoardOrders,
} from "@/modules/artwork/repositories/artworkRepository";
import { ProductionTagDialog } from "@/modules/production/components/ProductionTagDialog";
import {
  listProductionAssignees,
  listProductionBoardOrders,
} from "@/modules/production/repositories/productionRepository";
import {
  returnOrderToArt,
  setProductionTag,
  updateOrderInsumos,
} from "@/features/hubos/api";
import type { ProductionTag } from "@/features/hubos/types";
import { getValidOrderTransitions } from "@/modules/orders/services/orderTransitions";
import { BoardCard } from "./BoardCard";
import { BoardColumn } from "./BoardColumn";
import { BoardFilters } from "./BoardFilters";
import {
  applyArtworkPreset,
  applyProductionPreset,
  ART_BOARD_COLUMNS,
  cardStatus,
  filterBoardCards,
  groupBoardCards,
  PRODUCTION_BOARD_COLUMNS,
} from "./boardDomain";
import { moveBoardOrder } from "./boardService";
import { calculateBoardMetrics } from "./boardMetrics";
import {
  EMPTY_BOARD_FILTERS,
  type BoardAssignee,
  type BoardCardModel,
  type BoardFiltersState,
  type BoardKind,
  type BoardStatus,
} from "./types";
import { useBoardRealtime } from "./useBoardRealtime";
import { ArtworkFilters, clearArtworkFilters } from "@/modules/artwork/components/ArtworkFilters";
import { ArtworkSummaryCards } from "@/modules/artwork/components/ArtworkSummaryCards";
import { ArtworkQuickView } from "@/modules/artwork/components/ArtworkQuickView";
import { getArtworkQueuePositions, getBoardColumnDomId, sortArtworkCards } from "@/modules/artwork/presentation/artworkPresentation";
import type { ArtStatus } from "@/features/hubos/types";

export function OperationalBoard({
  board,
  preset = "all",
}: {
  board: BoardKind;
  preset?: string;
}) {
  const presetTitles: Record<string, string> =
    board === "art"
      ? {
          all: "Arte",
          approvals: "Arte · Aguardando aprovação",
          revisions: "Arte · Ajustes",
        }
      : {
          all: "Produção",
          production: "Produção · Em produção",
          printing: "Produção · Impressão",
          finishing: "Produção · Em acabamento",
          lettering: "Produção · Letra caixa",
          supplies: "Produção · Aguardando insumos",
          external: "Produção · Produção externa",
          ready: "Produção · Material pronto",
        };
  const { user, hubRole, hubPermissions } = useAuth();
  const [cards, setCards] = useState<BoardCardModel[]>([]),
    [assignees, setAssignees] = useState<BoardAssignee[]>([]);
  const [filters, setFilters] =
      useState<BoardFiltersState>(EMPTY_BOARD_FILTERS),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null),
    [tagCard, setTagCard] = useState<BoardCardModel | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<ArtStatus | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [activeDragCardId, setActiveDragCardId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<BoardStatus | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [tag, setTag] = useState<ProductionTag>("EM_PRODUCAO"),
    [insumos, setInsumos] = useState("");
  const canMove =
    board === "art"
      ? hubPermissions.canMoveArteBoard
      : hubPermissions.canMoveProducaoBoard;
  const columns =
    board === "art" ? ART_BOARD_COLUMNS : PRODUCTION_BOARD_COLUMNS;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    })
  );
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [nextCards, nextAssignees] = await Promise.all([
          board === "art"
            ? listArtworkBoardOrders()
            : listProductionBoardOrders(),
          board === "art" ? listArtworkAssignees() : listProductionAssignees(),
        ]);
        setCards(nextCards);
        setAssignees(nextAssignees);
        setUpdatedAt(new Date());
        setError(false);
      } catch (cause) {
        console.error(cause);
        setError(true);
        if (silent) toast.error("Não foi possível sincronizar o quadro.");
      } finally {
        setLoading(false);
      }
    },
    [board]
  );
  useEffect(() => {
    void load();
  }, [load]);
  useBoardRealtime(
    useCallback(() => {
      void load(true);
    }, [load])
  );
  const presetCards = useMemo(
    () =>
      board === "art"
        ? applyArtworkPreset(cards, preset)
        : applyProductionPreset(cards, preset),
    [board, cards, preset]
  );
  const visible = useMemo(
    () => filterBoardCards(presetCards, filters, user?.id),
    [presetCards, filters, user?.id]
  );
  const grouped = useMemo(
    () => groupBoardCards(board === "art" ? sortArtworkCards(visible) : visible, board, columns, board === "art"),
    [visible, board, columns]
  );
  const boardMoves = (card: BoardCardModel) =>
    getValidOrderTransitions({
      board,
      from: cardStatus(card, board),
      role: hubRole,
      isManager: hubPermissions.isManager,
    }).filter(move => (columns as BoardStatus[]).includes(move));
  const metrics = useMemo(
    () => calculateBoardMetrics(cards, board),
    [cards, board]
  );
  const queuePositions = useMemo(() => getArtworkQueuePositions(presetCards), [presetCards]);
  const selectedCard = cards.find(card => card.order.id === selectedCardId) ?? null;
  useEffect(() => { if (selectedCardId && !selectedCard) setSelectedCardId(null); }, [selectedCardId, selectedCard]);
  const focusColumn = (status: ArtStatus) => {
    const next = focusedColumn === status ? null : status;
    setFocusedColumn(next);
    if (next) requestAnimationFrame(() => document.getElementById(getBoardColumnDomId(next))?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
  };
  const performMove = async (card: BoardCardModel, to: BoardStatus) => {
    const previous = cards;
    setCards(current =>
      current.map(value =>
        value.order.id === card.order.id
          ? {
              ...value,
              order: {
                ...value.order,
                ...(board === "art"
                  ? { art_status: to as typeof value.order.art_status }
                  : { prod_status: to as typeof value.order.prod_status }),
              },
            }
          : value
      )
    );
    try {
      await moveBoardOrder({
        order: card.order,
        board,
        to,
        role: hubRole,
        isManager: hubPermissions.isManager,
      });
      toast.success(
        to === "Produzir" ? "OS enviada para Produção." : "Etapa atualizada."
      );
      await load(true);
    } catch (cause) {
      setCards(previous);
      toast.error(
        cause instanceof Error
          ? cause.message
          : "O banco rejeitou o movimento; o cartão foi restaurado."
      );
    }
  };
  const requestMove = (card: BoardCardModel, to: BoardStatus) => {
    if (board === "art" && to === "Produzir") {
      if (!card.order.delivery_deadline_preset) {
        toast.error(
          "Esta OS está sem prazo de produção. Solicite ao Comercial ou Gerência a definição do prazo antes de enviar para Produção."
        );
        return;
      }
      if (
        card.order.delivery_deadline_preset === "CUSTOM" &&
        !card.order.delivery_date
      ) {
        toast.error(
          "Esta OS possui prazo personalizado, mas a data não foi definida. Solicite ao Comercial ou Gerência a correção da OS."
        );
        return;
      }
    }
    void performMove(card, to);
  };
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !canMove) return;
    const card = cards.find(value => value.order.id === active.id);
    const to = String(over.id) as BoardStatus;
    if (!card || cardStatus(card, board) === to) return;
    const moves = boardMoves(card);
    if (!moves.includes(to))
      return toast.error(board === "art" ? "Movimento não permitido pelo fluxo da Arte para esta OS." : "Movimento não permitido pelo fluxo operacional.");
    requestMove(card, to);
  };
  const saveTag = async () => {
    const resolving =
      tagCard?.order.production_tag === "AGUARDANDO_INSUMOS" &&
      tag === "EM_PRODUCAO";
    if (
      !tagCard ||
      ((tag === "AGUARDANDO_INSUMOS" || resolving) && !insumos.trim())
    )
      return toast.error(
        resolving
          ? "Informe como o insumo foi resolvido."
          : "Informe qual material está faltando."
      );
    try {
      if (resolving)
        await updateOrderInsumos(tagCard.order.id, "RESOLVE", insumos);
      else if (tag === "AGUARDANDO_INSUMOS")
        await updateOrderInsumos(tagCard.order.id, "REQUEST", insumos);
      else await setProductionTag(tagCard.order.id, tag, null);
      toast.success("Condição de Produção atualizada.");
      setTagCard(null);
      await load(true);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao atualizar tag."
      );
    }
  };
  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        {board === "art" && <div className="grid grid-cols-2 gap-2 md:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[72px] animate-pulse rounded-xl bg-muted" />)}</div>}
        {board === "art" && <div className="h-16 animate-pulse rounded-xl bg-muted" />}
        <div className="flex gap-4 overflow-hidden">
          {columns.map(column => (
            <div
              key={column}
              className="h-96 w-[300px] shrink-0 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      </div>
    );
  if (error && !cards.length)
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="font-medium">Não foi possível carregar o quadro.</p>
        <Button className="mt-4" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  const activeCard = cards.find(card => card.order.id === activeDragCardId);
  const validDragMoves = activeCard ? boardMoves(activeCard) : [];
  const dragStart = ({ active }: DragStartEvent) => board === "art" && setActiveDragCardId(String(active.id));
  const dragOver = ({ over }: DragOverEvent) => board === "art" && setDragOverStatus(over ? String(over.id) as BoardStatus : null);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {presetTitles[preset] ?? presetTitles.all}
          </h1>
          <p className="text-sm text-muted-foreground">{board === "art" ? "Acompanhe criação, ajustes e aprovações do setor." : updatedAt ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Projeção operacional das OS"}</p>
        </div>
        <div className="flex gap-2">
          {board === "art" && updatedAt && <span className="hidden self-center text-xs text-muted-foreground sm:inline">Atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
          {preset !== "all" && (
            <Button asChild variant="outline" size="sm">
              <Link href={board === "art" ? "/os/arte" : "/os/producao"}>
                Ver quadro completo
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </header>
      {board === "art" ? <ArtworkSummaryCards metrics={metrics} focusedColumn={focusedColumn} urgent={filters.urgent} overdue={filters.overdue} onFocus={focusColumn} onUrgent={() => setFilters(value => ({ ...value, urgent: !value.urgent }))} onOverdue={() => setFilters(value => ({ ...value, overdue: !value.overdue }))}/> : <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-lg bg-muted/55 px-3 py-2">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="text-xl font-semibold">{metric.count}</p>
          </div>
        ))}
      </div>}
      {board === "art" ? <ArtworkFilters value={filters} assignees={assignees} onChange={setFilters}/> : <BoardFilters
        board={board}
        value={filters}
        assignees={assignees}
        onChange={setFilters}
      />}
      {visible.length === 0 && cards.length > 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground"><SearchX className="mx-auto mb-2 h-6 w-6"/><strong className="block text-foreground">Nenhuma OS encontrada</strong><p className="mb-3">Revise ou limpe os filtros aplicados.</p>{board === "art" && <Button variant="outline" onClick={() => setFilters(clearArtworkFilters(filters))}>Limpar filtros</Button>}</div>
      ) : null}
      <DndContext sensors={sensors} onDragStart={dragStart} onDragOver={dragOver} onDragCancel={() => { setActiveDragCardId(null); setDragOverStatus(null); }} onDragEnd={event => { dragEnd(event); setActiveDragCardId(null); setDragOverStatus(null); }}>
        <div className="relative"><Button aria-label="Rolar quadro para a esquerda" variant="secondary" size="icon" className="absolute left-1 top-1/2 z-20 hidden rounded-full shadow md:flex" onClick={() => boardScrollRef.current?.scrollBy({ left: -320, behavior: "smooth" })}><ChevronLeft/></Button><Button aria-label="Rolar quadro para a direita" variant="secondary" size="icon" className="absolute right-1 top-1/2 z-20 hidden rounded-full shadow md:flex" onClick={() => boardScrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}><ChevronRight/></Button>
        <div ref={boardScrollRef} className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(column => (
            <BoardColumn
              key={column}
              status={column}
              count={grouped.get(column)?.length ?? 0}
              variant={board === "art" ? "art-modern" : "default"}
              focused={focusedColumn === column}
              dropAllowed={board === "art" && dragOverStatus === column ? validDragMoves.includes(column) : null}
            >
              {grouped.get(column)?.map(card => (
                <BoardCard
                  key={card.order.id}
                  card={card}
                  board={board}
                  canMove={canMove}
                  isManager={hubPermissions.isManager}
                  moves={boardMoves(card)}
                  onMove={to => requestMove(card, to)}
                  onOpenDetails={board === "art" ? () => setSelectedCardId(card.order.id) : undefined}
                  queuePosition={board === "art" ? queuePositions.get(card.order.id) : undefined}
                  onTag={
                    board === "production" && canMove
                      ? () => {
                          setTag(card.order.production_tag ?? "EM_PRODUCAO");
                          setInsumos(card.order.insumos_details ?? "");
                          setTagCard(card);
                        }
                      : undefined
                  }
                  onReturn={
                    board === "production" && hubPermissions.isManager
                      ? async () => {
                          try {
                            await returnOrderToArt(card.order.id);
                            toast.success("OS devolvida para Arte.");
                            await load(true);
                          } catch (cause) {
                            toast.error(
                              cause instanceof Error
                                ? cause.message
                                : "Falha ao voltar para Arte."
                            );
                          }
                        }
                      : undefined
                  }
                />
              ))}
            </BoardColumn>
          ))}
        </div></div>
      </DndContext>
      {board === "art" && <ArtworkQuickView card={selectedCard} open={Boolean(selectedCard)} canMove={canMove} moves={selectedCard ? boardMoves(selectedCard) : []} onOpenChange={open => !open && setSelectedCardId(null)} onMove={to => selectedCard && requestMove(selectedCard, to)}/>}
      <ProductionTagDialog
        card={tagCard}
        tag={tag}
        details={insumos}
        onTagChange={setTag}
        onDetailsChange={setInsumos}
        onClose={() => setTagCard(null)}
        onSave={() => void saveTag()}
      />
    </div>
  );
}
