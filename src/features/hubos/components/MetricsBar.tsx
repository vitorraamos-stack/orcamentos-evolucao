import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricsBarProps {
  global: number;
  totalArte: number;
  totalProducao: number;
  aguardandoInsumos?: number;
  producaoExterna?: number;
  overdue: number;
  prontoAvisar: number;
  instalacoes: number;
  pendentes: number;
  insumosAlertActive?: boolean;
  onGlobalClick?: () => void;
  onArteClick?: () => void;
  onProducaoClick?: () => void;
  onAguardandoInsumosClick?: () => void;
  onProducaoExternaClick?: () => void;
  onAtrasadosClick?: () => void;
  onProntoAvisarClick?: () => void;
  onInstalacoesClick?: () => void;
  onPendentesClick?: () => void;
}

const MetricCard = ({
  label,
  value,
  onClick,
  className,
  attention,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  className?: string;
  attention?: boolean;
}) => {
  const isInteractive = Boolean(onClick);
  return (
    <Card
      className={cn(
        "relative flex min-w-[160px] flex-col gap-1 p-3",
        isInteractive &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        attention &&
          "border-red-300 bg-red-50 text-red-950 ring-2 ring-red-300/80 animate-pulse [animation-duration:1.2s] motion-reduce:animate-none",
        className
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
      <div className="flex items-center gap-2">
        {attention && (
          <ArrowRight
            className="h-5 w-5 text-red-700 animate-[inboxArrow_900ms_ease-in-out_infinite] motion-reduce:animate-none"
            aria-hidden
          />
        )}
        <span className="text-xl font-semibold">{value}</span>
      </div>
    </Card>
  );
};

export default function MetricsBar({
  global,
  totalArte,
  totalProducao,
  aguardandoInsumos,
  producaoExterna,
  overdue,
  prontoAvisar,
  instalacoes,
  pendentes,
  insumosAlertActive = false,
  onGlobalClick,
  onArteClick,
  onProducaoClick,
  onAguardandoInsumosClick,
  onProducaoExternaClick,
  onAtrasadosClick,
  onProntoAvisarClick,
  onInstalacoesClick,
  onPendentesClick,
}: MetricsBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard label="GLOBAL" value={global} onClick={onGlobalClick} />
      <MetricCard label="Total em Arte" value={totalArte} onClick={onArteClick} />
      <MetricCard
        label="Total em Produção"
        value={totalProducao}
        onClick={onProducaoClick}
      />
      {typeof aguardandoInsumos === "number" && onAguardandoInsumosClick && (
        <MetricCard
          label="Aguardando Insumos"
          value={aguardandoInsumos}
          onClick={onAguardandoInsumosClick}
          attention={insumosAlertActive && aguardandoInsumos > 0}
        />
      )}
      {typeof producaoExterna === "number" && onProducaoExternaClick && (
        <MetricCard
          label="Produção Externa"
          value={producaoExterna}
          onClick={onProducaoExternaClick}
        />
      )}
      <MetricCard label="Atrasados" value={overdue} onClick={onAtrasadosClick} />
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
        label="Pendentes/Financeiro"
        value={pendentes}
        onClick={onPendentesClick}
        className={
          pendentes > 0
            ? "border-orange-300 bg-orange-50 text-orange-950 animate-pulse [animation-duration:2.8s] [animation-timing-function:ease-in-out] motion-reduce:animate-none"
            : undefined
        }
      />
    </div>
  );
}
