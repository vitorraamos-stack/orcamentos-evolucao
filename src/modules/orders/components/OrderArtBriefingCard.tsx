import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import type { OsOrder } from "@/features/hubos/types";

/** Dedicated, read-only artwork briefing: the same description saved at OS creation. */
export function OrderArtBriefingCard({ order }: { order: Pick<OsOrder, "description"> }) {
  const briefing = order.description?.trim() ?? "";

  return (
    <Card className="evolu-detail__section-card min-w-0" aria-label="Briefing de Arte">
      <CardHeader className="evolu-detail__section-header">
        <div className="evolu-detail__card-heading"><Pencil className="size-5" aria-hidden="true" /><CardTitle>Briefing de Arte</CardTitle></div>
      </CardHeader>
      <CardContent>
        {briefing ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {briefing}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum briefing de arte informado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
