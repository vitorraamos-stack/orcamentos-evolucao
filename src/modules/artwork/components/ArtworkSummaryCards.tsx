import { Clock3, Inbox, Palette, TriangleAlert, Zap } from "lucide-react";
import type { BoardStatus } from "@/shared/kanban/types";

export function ArtworkSummaryCards({
  metrics,
  focusedColumn,
  urgent,
  overdue,
  onFocus,
  onUrgent,
  onOverdue,
}: {
  metrics: { label: string; count: number }[];
  focusedColumn: BoardStatus | null;
  urgent: boolean;
  overdue: boolean;
  onFocus: (status: BoardStatus) => void;
  onUrgent: () => void;
  onOverdue: () => void;
}) {
  const config = [
    {
      label: "Caixa de Entrada",
      icon: Inbox,
      active: focusedColumn === "Caixa de Entrada",
      click: () => onFocus("Caixa de Entrada"),
    },
    {
      label: "Arte em andamento",
      icon: Palette,
      active: focusedColumn === "Em Criação",
      click: () => onFocus("Em Criação"),
    },
    {
      label: "Aguardando Aprovação",
      icon: Clock3,
      active: focusedColumn === "Para Aprovação",
      click: () => onFocus("Para Aprovação"),
    },
    { label: "Urgentes", icon: Zap, active: urgent, click: onUrgent },
    {
      label: "Atrasadas",
      icon: TriangleAlert,
      active: overdue,
      click: onOverdue,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {config.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={item.active}
            onClick={item.click}
            className={`flex h-[72px] items-center gap-3 rounded-xl border bg-card px-3 text-left transition hover:border-primary/40 ${item.active ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""}`}
          >
            <span className="rounded-lg bg-muted p-2">
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">
                {item.label}
              </span>
              <strong className="text-xl">
                {metrics.find(metric => metric.label === item.label)?.count ??
                  0}
              </strong>
            </span>
          </button>
        );
      })}
    </div>
  );
}
