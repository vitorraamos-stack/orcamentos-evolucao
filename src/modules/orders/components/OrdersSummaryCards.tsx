import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Siren,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderSummary } from "../orderSummary";

const cards: Array<{
  key: keyof OrderSummary;
  label: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    key: "total",
    label: "Total de OS",
    icon: ClipboardList,
    tone: "text-primary bg-primary/10",
  },
  {
    key: "active",
    label: "Em andamento",
    icon: CircleDot,
    tone: "text-blue-700 bg-blue-50",
  },
  {
    key: "overdue",
    label: "Atrasadas",
    icon: AlertTriangle,
    tone: "text-destructive bg-destructive/10",
  },
  {
    key: "urgent",
    label: "Urgentes",
    icon: Siren,
    tone: "text-amber-700 bg-amber-50",
  },
  {
    key: "finished",
    label: "Finalizadas",
    icon: CheckCircle2,
    tone: "text-emerald-700 bg-emerald-50",
  },
];

export function OrdersSummaryCards({ summary }: { summary: OrderSummary }) {
  return (
    <section
      aria-label="Resumo das ordens"
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
    >
      {cards.map(({ key, label, icon: Icon, tone }) => (
        <Card key={key} className="gap-0 py-0 shadow-xs">
          <CardContent className="flex items-center gap-3 p-4">
            <span className={`rounded-lg p-2 ${tone}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">
                {label}
              </p>
              <p className="text-2xl font-bold tabular-nums">{summary[key]}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
