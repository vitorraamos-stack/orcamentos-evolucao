import {
  ClipboardCheck,
  Factory,
  PackageCheck,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import type { BoardStatus } from "@/shared/kanban/types";

export function ProductionSummaryCards({
  metrics,
  focusedColumn,
  awaitingSupplies,
  overdue,
  onFocus,
  onAwaitingSupplies,
  onOverdue,
}: {
  metrics: { label: string; count: number }[];
  focusedColumn: BoardStatus | null;
  awaitingSupplies: boolean;
  overdue: boolean;
  onFocus: (status: BoardStatus) => void;
  onAwaitingSupplies: () => void;
  onOverdue: () => void;
}) {
  const config = [
    {
      label: "Em Produção",
      icon: Factory,
      active: focusedColumn === "Produção",
      click: () => onFocus("Produção"),
    },
    {
      label: "Acabamento / Conferência",
      icon: ClipboardCheck,
      active: focusedColumn === "Em Acabamento",
      click: () => onFocus("Em Acabamento"),
    },
    {
      label: "Aguardando insumos",
      icon: PackageX,
      active: awaitingSupplies,
      click: onAwaitingSupplies,
    },
    {
      label: "Material Pronto",
      icon: PackageCheck,
      active: focusedColumn === "Pronto / Avisar Cliente",
      click: () => onFocus("Pronto / Avisar Cliente"),
    },
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
