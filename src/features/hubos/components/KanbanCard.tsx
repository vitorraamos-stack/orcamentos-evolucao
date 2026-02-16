import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { GripVertical, Archive } from "lucide-react";
import type {
  ArtDirectionTag,
  LogisticType,
  ProdStatus,
  ProductionTag,
} from "../types";
import { ART_DIRECTION_TAG_CONFIG } from "../artDirectionTagConfig";

interface KanbanCardProps {
  id: string;
  title: string;
  clientName: string;
  deliveryDate?: string | null;
  logisticType: LogisticType;
  reproducao: boolean;
  letraCaixa: boolean;
  prodStatus?: ProdStatus | null;
  productionTag?: ProductionTag | null;
  insumosReturnNotes?: string | null;
  artDirectionTag?: ArtDirectionTag | null;
  assetIndicator?: "processing" | "done" | null;
  highlightId?: string | null;
  showArchive?: boolean;
  onOpen?: () => void;
  onArchive?: () => void;
  onMarkInsumosAsInProduction?: () => void;
  markingInsumosAsInProduction?: boolean;
}

const logisticLabel: Record<LogisticType, string> = {
  retirada: "Retirada",
  entrega: "Entrega",
  instalacao: "Instalação",
};

const productionTagConfig: Record<
  ProductionTag,
  { label: string; className: string }
> = {
  EM_PRODUCAO: { label: "Em Produção", className: "bg-orange-500 text-white" },
  AGUARDANDO_INSUMOS: {
    label: "Aguardando Insumos",
    className: "bg-red-600 text-white",
  },
  PRODUCAO_EXTERNA: {
    label: "Produção Externa",
    className: "bg-indigo-600 text-white",
  },
  PRONTO: { label: "Pronto", className: "bg-emerald-500 text-white" },
};

const returnNotesBadgeClassName =
  "bg-yellow-400 text-yellow-950 hover:bg-yellow-400";

const formatDeliveryDate = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  }
  return value;
};

export default function KanbanCard({
  id,
  title,
  clientName,
  deliveryDate,
  logisticType,
  reproducao,
  letraCaixa,
  prodStatus,
  productionTag,
  insumosReturnNotes,
  artDirectionTag,
  assetIndicator,
  highlightId,
  showArchive = false,
  onOpen,
  onArchive,
  onMarkInsumosAsInProduction,
  markingInsumosAsInProduction = false,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const trimmedInsumosReturnNotes = insumosReturnNotes?.trim() ?? "";
  const hasInsumosReturnNotes = trimmedInsumosReturnNotes.length > 0;
  const formattedDeliveryDate = formatDeliveryDate(deliveryDate);
  const shouldShowMaterialReadyBadge =
    prodStatus === "Instalação Agendada" && productionTag === "PRONTO";
  const productionTagBadge =
    productionTag === "EM_PRODUCAO" && hasInsumosReturnNotes
      ? { label: "Insumo disponível", className: returnNotesBadgeClassName }
      : shouldShowMaterialReadyBadge
        ? { label: "Material Pronto", className: productionTagConfig.PRONTO.className }
      : productionTag
        ? productionTagConfig[productionTag]
        : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-os-id={id}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onDoubleClickCapture={() => {
        if (!isDragging) {
          onOpen?.();
        }
      }}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "cursor-pointer space-y-2 rounded-lg border border-border/60 bg-background p-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:ring-1 hover:ring-ring/30",
        isDragging && "opacity-60",
        highlightId === id && "ring-2 ring-primary ring-offset-2 animate-pulse"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            <Badge variant="outline">{logisticLabel[logisticType]}</Badge>
            {deliveryDate && (
              <Badge className="border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-100">
                Entrega: {formattedDeliveryDate}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{clientName}</p>
        </div>
        <div
          className="rounded-md border border-border/60 p-1 text-muted-foreground hover:text-foreground"
          role="button"
          tabIndex={0}
          aria-label="Arrastar card"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {reproducao && <Badge variant="destructive">Reprodução</Badge>}
        {letraCaixa && <Badge variant="secondary">Letra Caixa</Badge>}
        {productionTagBadge &&
          (prodStatus === "Produção" || shouldShowMaterialReadyBadge) && (
          <Badge className={productionTagBadge.className}>
            {productionTagBadge.label}
          </Badge>
        )}
        {artDirectionTag && (
          <Badge
            className="border-0 text-white"
            style={{
              backgroundColor: ART_DIRECTION_TAG_CONFIG[artDirectionTag].color,
            }}
          >
            {ART_DIRECTION_TAG_CONFIG[artDirectionTag].label}
          </Badge>
        )}
        {assetIndicator && (
          <Badge
            variant="outline"
            className={cn(
              "border text-xs",
              assetIndicator === "processing" &&
                "border-yellow-300 bg-yellow-50 text-yellow-700 animate-pulse [animation-duration:3s] motion-reduce:animate-none",
              assetIndicator === "done" &&
                "border-emerald-300 bg-emerald-50 text-emerald-700"
            )}
          >
            {assetIndicator === "processing" ? "Processando" : "Arquivo OK"}
          </Badge>
        )}
      </div>
      {prodStatus === "Produção" && hasInsumosReturnNotes && (
        <div className="space-y-2 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-yellow-800">
            Observações de Insumos
          </p>
          <p className="whitespace-pre-line text-xs text-yellow-950">
            {trimmedInsumosReturnNotes}
          </p>
          {productionTag === "EM_PRODUCAO" && onMarkInsumosAsInProduction && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-yellow-400 bg-white text-yellow-900 hover:bg-yellow-100"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                onMarkInsumosAsInProduction();
              }}
              disabled={markingInsumosAsInProduction}
            >
              {markingInsumosAsInProduction ? "Atualizando..." : "Marcar como Em Produção"}
            </Button>
          )}
        </div>
      )}
      {showArchive && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="inline-flex w-fit flex-wrap gap-2">
            {showArchive && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                  >
                    <Archive className="mr-1 h-4 w-4" />
                    Arquivar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent
                  onPointerDown={event => event.stopPropagation()}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle>Arquivar este card?</AlertDialogTitle>
                    <AlertDialogDescription>
                      O card será removido do Kanban padrão, mas ficará salvo
                      para consulta.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onPointerDown={event => event.stopPropagation()}
                    >
                      Cancelar
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.stopPropagation();
                        onArchive?.();
                      }}
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
