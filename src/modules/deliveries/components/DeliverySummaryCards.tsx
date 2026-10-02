import {
  CircleCheck,
  ClipboardList,
  PackageCheck,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DeliverySummaryKey =
  | "waiting"
  | "pickup"
  | "in_transit"
  | "overdue"
  | "today";
export function DeliverySummaryCards({
  values,
  active,
  onSelect,
}: {
  values: {
    waiting: number;
    pickup: number;
    inTransit: number;
    overdue: number;
    completedToday: number;
  };
  active: DeliverySummaryKey | null;
  onSelect: (key: DeliverySummaryKey) => void;
}) {
  const cards: Array<[DeliverySummaryKey, string, number, LucideIcon, string]> =
    [
      [
        "waiting",
        "Aguardando cadastro",
        values.waiting,
        ClipboardList,
        "text-amber-700 bg-amber-500/10",
      ],
      [
        "pickup",
        "Retiradas",
        values.pickup,
        PackageCheck,
        "text-primary bg-primary/10",
      ],
      [
        "in_transit",
        "Em trânsito",
        values.inTransit,
        Truck,
        "text-blue-700 bg-blue-500/10",
      ],
      [
        "overdue",
        "Atrasadas",
        values.overdue,
        TriangleAlert,
        "text-destructive bg-destructive/10",
      ],
      [
        "today",
        "Concluídas hoje",
        values.completedToday,
        CircleCheck,
        "text-emerald-700 bg-emerald-500/10",
      ],
    ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([key, label, value, Icon, tone]) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => onSelect(key)}
          className={cn(
            "flex h-20 items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active === key && "border-primary ring-1 ring-primary/20"
          )}
        >
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              tone
            )}
          >
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-2xl font-bold leading-none">
              {value}
            </span>
            <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">
              {label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
