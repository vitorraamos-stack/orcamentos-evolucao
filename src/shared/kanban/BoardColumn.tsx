import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { getOperationalStatusLabel } from "./statusLabels";
import type { BoardStatus } from "./types";
import { Inbox } from "lucide-react";
import { getBoardColumnDomId } from "@/modules/artwork/presentation/artworkPresentation";

export function BoardColumn({
  status,
  count,
  children,
  variant = "default",
  focused = false,
  dropAllowed,
}: {
  status: BoardStatus;
  count: number;
  children: ReactNode;
  variant?: "default" | "art-modern";
  focused?: boolean;
  dropAllowed?: boolean | null;
}) {
  const drop = useDroppable({ id: status });
  return (
    <section
      id={variant === "art-modern" ? getBoardColumnDomId(status) : undefined}
      ref={drop.setNodeRef}
      className={`w-[300px] shrink-0 rounded-xl bg-muted/45 p-3 ${variant === "art-modern" ? "border transition md:w-[288px]" : ""} ${focused ? "bg-primary/5 ring-1 ring-primary/30" : ""} ${drop.isOver ? dropAllowed === false ? "ring-2 ring-destructive/40" : "ring-2 ring-primary/40" : ""}`}
    >
      <header className={variant === "art-modern" ? "sticky top-0 z-10 mb-2 flex items-center justify-between bg-muted/95 py-1" : "mb-3 flex items-center justify-between"}>
        <h2 className="text-sm font-semibold">{getOperationalStatusLabel(status)}</h2>
        <Badge variant="secondary" className={variant === "art-modern" ? "text-[10px]" : ""}>{count}</Badge>
      </header>
      <div className={variant === "art-modern" ? "space-y-2 md:max-h-[calc(100vh-360px)] md:min-h-32 md:overflow-y-auto md:pr-1" : "space-y-3"}>
        {count ? (
          children
        ) : (
          <div className={variant === "art-modern" ? "py-8 text-center text-xs text-muted-foreground" : "rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground"}>
            {variant === "art-modern" && <><Inbox className="mx-auto mb-2 h-5 w-5 opacity-50"/><strong className="mb-1 block font-medium text-foreground">Tudo certo por aqui</strong></>}
            Nenhuma OS nesta etapa.
          </div>
        )}
      </div>
    </section>
  );
}
