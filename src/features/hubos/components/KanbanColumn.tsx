import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface KanbanColumnProps {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
  headerAction?: ReactNode;
}

export default function KanbanColumn({ id, title, count, children, headerAction }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-w-[260px] flex-col gap-3 rounded-lg border border-border/50 bg-card/40 p-3',
        isOver && 'border-primary/60 bg-primary/5'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
          {headerAction}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
