import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OsOrder } from "@/features/hubos/types";
import { OrderRiskBadge } from "@/shared/components/OrderBadges";
import { calculateOrderRisk } from "../risk";
import type { OrderAssignee } from "../types/orderDetail";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(`${value}T12:00:00-03:00`)) : "Não definido";
const logistics = { retirada: "Retirada", entrega: "Entrega", instalacao: "Instalação" } as const;

export function OrderHeader({ order, assignees, canEdit, onEdit }: { order: OsOrder; assignees: OrderAssignee[]; canEdit: boolean; onEdit: () => void }) {
  const general = assignees.find(item => item.scope === "GENERAL")?.user?.name ?? "Não definido";
  return <header className="rounded-xl border bg-card p-4 sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">OS #{order.os_number ?? order.sale_number}</p>
        <div><h1 className="break-words text-xl font-bold sm:text-2xl">{order.client_name}</h1><p className="text-base text-muted-foreground">{order.title || order.description || "Sem título"}</p></div>
        <div className="flex flex-wrap gap-2"><Badge>{order.prod_status || order.art_status}</Badge>{order.art_direction_tag === "URGENTE" && <Badge variant="destructive">Urgente</Badge>}<OrderRiskBadge risk={calculateOrderRisk(order)} /></div>
      </div>
      {canEdit && <Button onClick={onEdit}>Editar OS</Button>}
    </div>
    <dl className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Prazo final</dt><dd className="font-medium">{date(order.delivery_date)}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Responsável geral</dt><dd className="font-medium">{general}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Logística</dt><dd className="font-medium">{logistics[order.logistic_type]}</dd></div>
    </dl>
  </header>;
}

