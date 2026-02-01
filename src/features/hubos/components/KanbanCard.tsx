import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { GripVertical, Trash2, Archive } from 'lucide-react';
import type { LogisticType, ProdStatus, ProductionTag } from '../types';

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
  highlightId?: string | null;
  isAdmin?: boolean;
  showArchive?: boolean;
  onOpen?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

const logisticLabel: Record<LogisticType, string> = {
  retirada: 'Retirada',
  entrega: 'Entrega',
  instalacao: 'Instalação',
};

const productionTagConfig: Record<ProductionTag, { label: string; className: string }> = {
  EM_PRODUCAO: { label: 'Em Produção', className: 'bg-orange-500 text-white' },
  PRONTO: { label: 'Pronto', className: 'bg-emerald-500 text-white' },
};

const formatDeliveryDate = (value?: string | null) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
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
  highlightId,
  isAdmin = false,
  showArchive = false,
  onOpen,
  onArchive,
  onDelete,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

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
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        'cursor-pointer space-y-2 rounded-lg border border-border/60 bg-background p-3 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:ring-1 hover:ring-ring/30',
        isDragging && 'opacity-60',
        highlightId === id && 'ring-2 ring-primary ring-offset-2 animate-pulse'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
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
        <Badge variant="outline">{logisticLabel[logisticType]}</Badge>
        {deliveryDate && <Badge variant="secondary">Entrega: {formatDeliveryDate(deliveryDate)}</Badge>}
        {reproducao && <Badge variant="destructive">Reprodução</Badge>}
        {letraCaixa && <Badge variant="secondary">Letra Caixa</Badge>}
        {productionTag && prodStatus === 'Produção' && (
          <Badge className={productionTagConfig[productionTag].className}>
            {productionTagConfig[productionTag].label}
          </Badge>
        )}
      </div>
      {(isAdmin || showArchive) && (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2">
          {showArchive && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Archive className="mr-1 h-4 w-4" />
                  Arquivar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onPointerDown={(event) => event.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Arquivar este card?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O card será removido do Kanban padrão, mas ficará salvo para consulta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onPointerDown={(event) => event.stopPropagation()}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
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
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onPointerDown={(event) => event.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Essa ação não pode ser desfeita. O card será excluído permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onPointerDown={(event) => event.stopPropagation()}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete?.();
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
