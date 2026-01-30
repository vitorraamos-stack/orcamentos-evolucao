import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  onOpen?: () => void;
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
  onOpen,
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
        isDragging && 'opacity-60'
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{clientName}</p>
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
    </div>
  );
}
