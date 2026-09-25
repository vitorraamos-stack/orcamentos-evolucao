import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssigneeScope, OrderAssignee, UserOption } from "../types/orderDetail";
const scopes: { value: AssigneeScope; label: string }[] = [{ value: "GENERAL", label: "Responsável geral" }, { value: "ART", label: "Arte" }, { value: "PRODUCTION", label: "Produção" }, { value: "FINISHING", label: "Acabamento" }, { value: "INSTALLATION", label: "Instalação" }];
const UNASSIGNED = "__unassigned__";
export function OrderAssigneesCard({ assignees, users, canEdit, onChange }: { assignees: OrderAssignee[]; users: UserOption[]; canEdit: boolean; onChange: (scope: AssigneeScope, userId: string) => void }) {
  return <Card><CardHeader><CardTitle>Responsáveis</CardTitle></CardHeader><CardContent className="space-y-3">{scopes.map(scope => {
    const assignee = assignees.find(item => item.scope === scope.value);
    return <div key={scope.value} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center"><span className="text-sm text-muted-foreground">{scope.label}</span>{canEdit ? <Select value={assignee?.user_id ?? UNASSIGNED} onValueChange={value => onChange(scope.value, value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select> : <span className="text-sm font-medium">{assignee?.user?.name ?? "Nenhum responsável definido para esta etapa."}</span>}</div>;
  })}</CardContent></Card>;
}
