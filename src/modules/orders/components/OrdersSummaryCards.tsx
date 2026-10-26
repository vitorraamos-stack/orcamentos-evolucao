import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CircleDot, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderSummary } from "../orderSummary";

const cards: Array<{
  key: "active" | "overdue" | "urgent";
  label: string;
  icon: LucideIcon;
  tone: string;
}> = [
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
];

type Props = {
  summary: OrderSummary | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedUrgent: boolean;
  onSelectUrgent: () => void;
};

export function OrdersSummaryCards({
  summary,
  loading,
  error,
  onRetry,
  selectedUrgent,
  onSelectUrgent,
}: Props) {
  return (
    <section aria-label="Resumo das ordens" className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:gap-3">
      {cards.map(({ key, label, icon: Icon, tone }) => {
        const value = loading || error || summary === null ? "—" : summary[key];
        const body = (
          <CardContent className="flex min-w-0 flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
            <span className={"rounded-lg p-2 " + tone}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
            </div>
          </CardContent>
        );
        return (
          <Card key={key} className="gap-0 py-0 shadow-xs">
            {key === "urgent" ? (
              <button
                type="button"
                onClick={onSelectUrgent}
                aria-pressed={selectedUrgent}
                aria-label="Filtrar ordens urgentes"
                className="min-h-11 w-full rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {body}
              </button>
            ) : body}
          </Card>
        );
      })}
      {loading && <p role="status" className="sr-only">Atualizando indicadores globais.</p>}
      {error && (
        <div role="alert" className="col-span-full flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <p className="text-sm">Não foi possível atualizar os indicadores globais.</p>
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={onRetry}>Tentar novamente</Button>
        </div>
      )}
    </section>
  );
}
