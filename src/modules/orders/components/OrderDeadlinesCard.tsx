import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { DELIVERY_DEADLINE_PRESET_CONFIG } from "@/features/hubos/deliveryDeadlineConfig";
import type { OsOrder } from "@/features/hubos/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getDeadlineState } from "../services/orderDeadlines";
import type { DeadlineScope, OrderDeadline } from "../types/orderDetail";

const internalScopes = [
  { value: "ART", label: "Arte" },
  { value: "PRODUCTION", label: "Produção" },
  { value: "FINISHING", label: "Acabamento" },
] as const satisfies ReadonlyArray<{ value: DeadlineScope; label: string }>;
const stateLabel = { NORMAL: "Normal", TODAY: "Vence hoje", OVERDUE: "Atrasado", COMPLETED: "Concluído" };

export const formatDeadlineDate = (value: string | null) => {
  const day = value?.split("T")[0];
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
};

export const getContractedDeadlineLabel = (preset: OsOrder["delivery_deadline_preset"]) => {
  if (!preset) return "Não definido";
  if (preset === "CUSTOM") return "Prazo personalizado";
  return DELIVERY_DEADLINE_PRESET_CONFIG[preset].label.replace(/^De /, "").replace(" à ", " a ").replace(", após", " após");
};

type Props = {
  order: Pick<OsOrder, "delivery_deadline_preset" | "delivery_deadline_started_at" | "delivery_date">;
  deadlines: OrderDeadline[];
  canEdit: boolean;
  onChange: (scope: DeadlineScope, date: string) => void;
  onComplete: (scope: DeadlineScope) => void;
  onReopen: (scope: DeadlineScope) => void;
  onRemove: (scope: DeadlineScope) => void;
};

export function OrderDeadlinesCard({ order, deadlines, canEdit, onChange, onComplete, onReopen, onRemove }: Props) {
  const [editing, setEditing] = useState<DeadlineScope | null>(null);
  const [removing, setRemoving] = useState<DeadlineScope | null>(null);
  const startedAt = formatDeadlineDate(order.delivery_deadline_started_at);
  const finalDeadline = formatDeadlineDate(order.delivery_date);
  return <Card><CardHeader><CardTitle>Prazos</CardTitle></CardHeader><CardContent className="space-y-5">
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Prazo contratado</dt><dd className="mt-1 font-medium">{getContractedDeadlineLabel(order.delivery_deadline_preset)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Contagem</dt><dd className="mt-1 font-medium">{startedAt ? `Iniciada em ${startedAt}` : "Contagem ainda não iniciada"}</dd></div>
      <div className="rounded-lg border bg-muted/30 px-3 py-2"><dt className="text-sm text-muted-foreground">Prazo final</dt><dd className="mt-1 text-lg font-semibold">{finalDeadline ?? (order.delivery_deadline_preset === "CUSTOM" ? "Ainda não definido" : "Ainda não calculado")}</dd></div>
    </dl>
    <Collapsible className="group border-t pt-3">
      <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between px-0 py-2 font-semibold">Metas internas por etapa<ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <p className="text-sm text-muted-foreground">Datas internas para organização da equipe. Não alteram o prazo contratado da OS.</p>
        {internalScopes.map(scope => { const deadline = deadlines.find(item => item.scope === scope.value); const state = deadline && getDeadlineState(deadline); return <div key={scope.value} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[120px_1fr_auto_auto] sm:items-center">
          <span className="text-sm text-muted-foreground">{scope.label}</span><div>{canEdit && (editing === scope.value || !deadline) ? <Input aria-label={`Data da meta de ${scope.label}`} className="max-w-48" type="date" value={deadline?.due_date ?? ""} onChange={event => { if (event.target.value) { onChange(scope.value, event.target.value); setEditing(null); } }} /> : <span className="text-sm font-medium">{formatDeadlineDate(deadline?.due_date ?? null) ?? "Não definido"}</span>}</div>
          {state && <Badge variant={state === "OVERDUE" ? "destructive" : "secondary"}>{stateLabel[state]}</Badge>}
          {canEdit && deadline && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Ações da meta de ${scope.label}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditing(scope.value)}>Alterar</DropdownMenuItem>{deadline.completed_at ? <DropdownMenuItem onClick={() => onReopen(scope.value)}>Reabrir</DropdownMenuItem> : <DropdownMenuItem onClick={() => onComplete(scope.value)}>Concluir</DropdownMenuItem>}<DropdownMenuItem className="text-destructive" onClick={() => setRemoving(scope.value)}>Remover prazo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
        </div>; })}
      </CollapsibleContent>
    </Collapsible>
    <AlertDialog open={Boolean(removing)} onOpenChange={open => !open && setRemoving(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover prazo?</AlertDialogTitle><AlertDialogDescription>O prazo desta etapa será removido. A ação ficará registrada no histórico.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { if (removing) onRemove(removing); setRemoving(null); }}>Remover</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </CardContent></Card>;
}
