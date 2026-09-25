import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

export function BoardColumn({
  status,
  count,
  children,
}: {
  status: string;
  count: number;
  children: ReactNode;
}) {
  const drop = useDroppable({ id: status });
  return (
    <section
      ref={drop.setNodeRef}
      className={`w-[300px] shrink-0 rounded-xl bg-muted/45 p-3 ${drop.isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{status}</h2>
        <Badge variant="secondary">{count}</Badge>
      </header>
      <div className="space-y-3">
        {count ? (
          children
        ) : (
          <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
            Nenhuma OS nesta etapa.
          </div>
        )}
      </div>
    </section>
  );
}
