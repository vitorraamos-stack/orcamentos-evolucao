import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricsBarProps {
  global: number;
  totalArte: number;
  totalProducao: number;
  overdue: number;
  prontoAvisar: number;
  instalacoes: number;
  pendentes: number;
  onGlobalClick?: () => void;
  onArteClick?: () => void;
  onProducaoClick?: () => void;
  onAtrasadosClick?: () => void;
  onProntoAvisarClick?: () => void;
  onInstalacoesClick?: () => void;
  onPendentesClick?: () => void;
}

const MetricCard = ({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) => {
  const isInteractive = Boolean(onClick);
  return (
    <Card
      className={cn(
        "flex min-w-[160px] flex-col gap-1 p-3",
        isInteractive &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={event => {
        if (!isInteractive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </Card>
  );
};

export default function MetricsBar({
  global,
  totalArte,
  totalProducao,
  overdue,
  prontoAvisar,
  instalacoes,
  pendentes,
  onGlobalClick,
  onArteClick,
  onProducaoClick,
  onAtrasadosClick,
  onProntoAvisarClick,
  onInstalacoesClick,
  onPendentesClick,
}: MetricsBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard label="GLOBAL" value={global} onClick={onGlobalClick} />
      <MetricCard
        label="Total em Arte"
        value={totalArte}
        onClick={onArteClick}
      />
      <MetricCard
        label="Total em Produção"
        value={totalProducao}
        onClick={onProducaoClick}
      />
      <MetricCard
        label="Atrasados"
        value={overdue}
        onClick={onAtrasadosClick}
      />
      <MetricCard
        label="Pronto/Avisar"
        value={prontoAvisar}
        onClick={onProntoAvisarClick}
      />
      <MetricCard
        label="Instalações"
        value={instalacoes}
        onClick={onInstalacoesClick}
      />
      <MetricCard
        label="Pendentes"
        value={pendentes}
        onClick={onPendentesClick}
      />
    </div>
  );
}
