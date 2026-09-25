import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDeadlineState } from "../services/orderDeadlines";
import type { DeadlineScope, OrderDeadline } from "../types/orderDetail";
const scopes: { value: DeadlineScope; label: string }[] = [{ value: "ART", label: "Arte" }, { value: "APPROVAL", label: "Aprovação" }, { value: "PRODUCTION", label: "Produção" }, { value: "FINISHING", label: "Acabamento" }, { value: "INSTALLATION", label: "Instalação" }];
const stateLabel = { NORMAL: "Normal", TODAY: "Vence hoje", OVERDUE: "Atrasado", COMPLETED: "Concluído" };
export function OrderDeadlinesCard({ deadlines, finalDeadline, canEdit, onChange }: { deadlines: OrderDeadline[]; finalDeadline: string | null; canEdit: boolean; onChange: (scope: DeadlineScope, date: string) => void }) {
  return <Card><CardHeader><CardTitle>Prazos</CardTitle></CardHeader><CardContent className="space-y-3">{scopes.map(scope => { const deadline = deadlines.find(item => item.scope === scope.value); const state = deadline && getDeadlineState(deadline); return <div key={scope.value} className="grid gap-1 sm:grid-cols-[120px_1fr_auto] sm:items-center"><span className="text-sm text-muted-foreground">{scope.label}</span>{canEdit ? <Input className="max-w-48" type="date" value={deadline?.due_date ?? ""} onChange={event => event.target.value && onChange(scope.value, event.target.value)} /> : <span>{deadline?.due_date ?? "Não definido"}</span>}{state && <Badge variant={state === "OVERDUE" ? "destructive" : "secondary"}>{stateLabel[state]}</Badge>}</div>; })}<div className="grid border-t pt-3 sm:grid-cols-[120px_1fr]"><span className="text-sm text-muted-foreground">Prazo final</span><strong>{finalDeadline ?? "Não definido"}</strong></div>{!deadlines.length && !canEdit && <p className="text-sm text-muted-foreground">Nenhum prazo de etapa definido.</p>}</CardContent></Card>;
}

