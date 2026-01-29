import { Card } from '@/components/ui/card';

interface MetricsBarProps {
  totalArte: number;
  totalProducao: number;
  overdue: number;
  paraAprovacao: number;
  prontoAvisar: number;
  instalacoes: number;
}

const MetricCard = ({ label, value }: { label: string; value: number }) => (
  <Card className="flex min-w-[160px] flex-col gap-1 p-3">
    <span className="text-xs uppercase text-muted-foreground">{label}</span>
    <span className="text-xl font-semibold">{value}</span>
  </Card>
);

export default function MetricsBar({
  totalArte,
  totalProducao,
  overdue,
  paraAprovacao,
  prontoAvisar,
  instalacoes,
}: MetricsBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <MetricCard label="Total em Arte" value={totalArte} />
      <MetricCard label="Total em Produção" value={totalProducao} />
      <MetricCard label="Atrasados" value={overdue} />
      <MetricCard label="Para Aprovação" value={paraAprovacao} />
      <MetricCard label="Pronto/Avisar" value={prontoAvisar} />
      <MetricCard label="Instalações" value={instalacoes} />
    </div>
  );
}
