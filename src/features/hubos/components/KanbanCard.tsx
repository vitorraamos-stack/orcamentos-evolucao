import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LogisticType } from '../types';

interface KanbanCardProps {
  id: string;
  title: string;
  clientName: string;
  deliveryDate?: string | null;
  logisticType: LogisticType;
  reproducao: boolean;
  letraCaixa: boolean;
}

const logisticLabel: Record<LogisticType, string> = {
  retirada: 'Retirada',
  entrega: 'Entrega',
  instalacao: 'Instalação',
};

export default function KanbanCard({
  id,
  title,
  clientName,
  deliveryDate,
  logisticType,
  reproducao,
  letraCaixa,
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
      className={cn(
        'space-y-2 rounded-lg border border-border/60 bg-background p-3 shadow-sm',
        isDragging && 'opacity-60'
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{clientName}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{logisticLabel[logisticType]}</Badge>
        {deliveryDate && <Badge variant="secondary">Entrega: {deliveryDate}</Badge>}
        {reproducao && <Badge variant="destructive">Reprodução</Badge>}
        {letraCaixa && <Badge variant="secondary">Letra Caixa</Badge>}
      </div>
    </div>
  );
}
