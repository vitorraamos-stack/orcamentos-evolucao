import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  returnOrderToArt,
  setProductionTag,
  updateOrderInsumos,
} from "@/features/hubos/api";
import type {
  DeliveryDeadlinePreset,
  ProductionTag,
} from "@/features/hubos/types";
import { DELIVERY_DEADLINE_PRESET_CONFIG } from "@/features/hubos/deliveryDeadlineConfig";
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
import { listBoardAssignees, listBoardOrders } from "./boardRepository";
import { moveBoardOrder } from "./boardService";
import {
  EMPTY_BOARD_FILTERS,
  type BoardCardModel,
  type BoardFiltersState,
  type BoardKind,
  type BoardStatus,
} from "./types";
import { useBoardRealtime } from "./useBoardRealtime";

export function OperationalBoard({
  board,
  preset = "all",
}: {
  board: BoardKind;
  preset?: string;
}) {
  const { user, hubRole, hubPermissions } = useAuth();
  const [cards, setCards] = useState<BoardCardModel[]>([]),
    [assignees, setAssignees] = useState<
      Awaited<ReturnType<typeof listBoardAssignees>>
    >([]);
  const [filters, setFilters] =
      useState<BoardFiltersState>(EMPTY_BOARD_FILTERS),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null),
    [handoff, setHandoff] = useState<BoardCardModel | null>(null),
    [tagCard, setTagCard] = useState<BoardCardModel | null>(null);
  const [deadlinePreset, setDeadlinePreset] = useState<
      DeliveryDeadlinePreset | ""
    >(""),
    [manualDate, setManualDate] = useState(""),
    [tag, setTag] = useState<ProductionTag>("EM_PRODUCAO"),
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
          listBoardOrders(board),
          listBoardAssignees(board),
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
    () => groupBoardCards(visible, board, columns),
    [visible, board, columns]
  );
  const metrics =
    board === "art"
      ? [
          {
            label: "Em Criação",
            count: cards.filter(c => c.order.art_status === "Em Criação")
              .length,
          },
          {
            label: "Para Aprovação",
            count: cards.filter(c => c.order.art_status === "Para Aprovação")
              .length,
          },
          {
            label: "Ajustes",
            count: cards.filter(c => c.order.art_status === "Ajustes").length,
          },
          {
            label: "Urgentes",
            count: cards.filter(c => c.order.art_direction_tag === "URGENTE")
              .length,
          },
          {
            label: "Atrasadas",
            count: cards.filter(c => c.risk === "CRITICO").length,
          },
        ]
      : [
          {
            label: "Produção",
            count: cards.filter(c => c.order.prod_status === "Produção").length,
          },
          {
            label: "Acabamento",
            count: cards.filter(c => c.order.prod_status === "Em Acabamento")
              .length,
          },
          {
            label: "Aguardando insumos",
            count: cards.filter(
              c => c.order.production_tag === "AGUARDANDO_INSUMOS"
            ).length,
          },
          {
            label: "Prontos",
            count: cards.filter(
              c => c.order.prod_status === "Pronto / Avisar Cliente"
            ).length,
          },
          {
            label: "Atrasadas",
            count: cards.filter(c => c.risk === "CRITICO").length,
          },
        ];
  const performMove = async (
    card: BoardCardModel,
    to: BoardStatus,
    options?: { preset?: DeliveryDeadlinePreset; manualDate?: string }
  ) => {
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
        preset: options?.preset,
        manualDate: options?.manualDate,
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
    if (
      board === "art" &&
      to === "Produzir" &&
      (!card.order.delivery_deadline_preset || !card.order.delivery_date)
    ) {
      setDeadlinePreset(card.order.delivery_deadline_preset ?? "");
      setManualDate(card.order.delivery_date ?? "");
      setHandoff(card);
      return;
    }
    void performMove(card, to);
  };
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !canMove) return;
    const card = cards.find(value => value.order.id === active.id);
    const to = String(over.id) as BoardStatus;
    if (!card || cardStatus(card, board) === to) return;
    const moves = getValidOrderTransitions({
      board,
      from: cardStatus(card, board),
      role: hubRole,
      isManager: hubPermissions.isManager,
    });
    if (!moves.includes(to))
      return toast.error("Movimento não permitido pelo fluxo operacional.");
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
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {board === "art" ? "Quadro de Arte" : "Quadro de Produção"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {updatedAt
              ? `Atualizado às ${updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Projeção operacional das OS"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-lg bg-muted/55 px-3 py-2">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="text-xl font-semibold">{metric.count}</p>
          </div>
        ))}
      </div>
      <BoardFilters
        board={board}
        value={filters}
        assignees={assignees}
        onChange={setFilters}
      />
      {visible.length === 0 && cards.length > 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma OS encontrada com estes filtros.
        </p>
      ) : null}
      <DndContext sensors={sensors} onDragEnd={dragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(column => (
            <BoardColumn
              key={column}
              status={column}
              count={grouped.get(column)?.length ?? 0}
            >
              {grouped.get(column)?.map(card => (
                <BoardCard
                  key={card.order.id}
                  card={card}
                  board={board}
                  canMove={canMove}
                  isManager={hubPermissions.isManager}
                  moves={getValidOrderTransitions({
                    board,
                    from: cardStatus(card, board),
                    role: hubRole,
                    isManager: hubPermissions.isManager,
                  })}
                  onMove={to => requestMove(card, to)}
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
        </div>
      </DndContext>
      <Dialog
        open={Boolean(handoff)}
        onOpenChange={open => !open && setHandoff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prazo para Produção</DialogTitle>
            <DialogDescription>
              O handoff inicia Produção e o prazo no banco.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={deadlinePreset}
            onValueChange={value =>
              setDeadlinePreset(value as DeliveryDeadlinePreset)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o prazo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DELIVERY_DEADLINE_PRESET_CONFIG).map(
                ([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {deadlinePreset === "CUSTOM" && (
            <Input
              type="date"
              value={manualDate}
              onChange={event => setManualDate(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandoff(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!handoff || !deadlinePreset) return;
                const card = handoff;
                setHandoff(null);
                void performMove(card, "Produzir", {
                  preset: deadlinePreset,
                  manualDate,
                });
              }}
            >
              Enviar para Produção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(tagCard)}
        onOpenChange={open => !open && setTagCard(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag de Produção</DialogTitle>
            <DialogDescription>
              A etapa não é alterada por esta condição operacional.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={tag}
            onValueChange={value => setTag(value as ProductionTag)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EM_PRODUCAO">Em produção</SelectItem>
              <SelectItem value="AGUARDANDO_INSUMOS">
                Aguardando insumos
              </SelectItem>
              <SelectItem value="PRODUCAO_EXTERNA">Produção externa</SelectItem>
              <SelectItem value="PRONTO">Pronto</SelectItem>
            </SelectContent>
          </Select>
          {(tag === "AGUARDANDO_INSUMOS" ||
            (tagCard?.order.production_tag === "AGUARDANDO_INSUMOS" &&
              tag === "EM_PRODUCAO")) && (
            <Input
              placeholder={
                tag === "AGUARDANDO_INSUMOS"
                  ? "Qual material está faltando?"
                  : "Como o insumo foi resolvido?"
              }
              value={insumos}
              onChange={event => setInsumos(event.target.value)}
            />
          )}
          <DialogFooter>
            <Button onClick={() => void saveTag()}>Salvar tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
