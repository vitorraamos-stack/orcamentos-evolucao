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
        'flex h-full min-h-0 min-w-[260px] max-w-[320px] flex-col rounded-lg border border-border/50 bg-card/40',
        isOver && 'border-primary/60 bg-primary/5'
      )}
    >
      <div className="z-10 flex shrink-0 items-center justify-between gap-2 rounded-t-lg border-b border-border/50 bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-2 overflow-hidden">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
          {headerAction}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3">
        {children}
      </div>
    </div>
  );
}
