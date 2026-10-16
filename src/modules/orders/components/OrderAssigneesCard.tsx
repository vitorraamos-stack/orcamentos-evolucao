import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssigneeScope, OrderAssignee, UserOption } from "../types/orderDetail";

const scopes: { value: AssigneeScope; label: string }[] = [
  { value: "GENERAL", label: "Responsável geral" },
  { value: "ART", label: "Arte" },
  { value: "PRODUCTION", label: "Produção" },
  { value: "FINISHING", label: "Acabamento" },
  { value: "INSTALLATION", label: "Instalação" },
];
const UNASSIGNED = "__unassigned__";
type Props = {
  assignees: OrderAssignee[];
  users: UserOption[];
  canEdit: boolean;
  onChange: (scope: AssigneeScope, userId: string, expectedUpdatedAt: string | null) => Promise<void>;
};

export function OrderAssigneesCard({ assignees, users, canEdit, onChange }: Props) {
  const [busyScope, setBusyScope] = useState<AssigneeScope | null>(null);
  const [failure, setFailure] = useState<{ scope: AssigneeScope; message: string } | null>(null);
  const change = async (scope: AssigneeScope, userId: string, expectedUpdatedAt: string | null) => {
    if (busyScope !== null) return;
    setBusyScope(scope);
    setFailure(null);
    try {
      await onChange(scope, userId, expectedUpdatedAt);
    } catch (error) {
      setFailure({
        scope,
        message: error instanceof Error ? error.message : "Não foi possível salvar. Confira a OS e tente novamente.",
      });
    } finally {
      setBusyScope(null);
    }
  };

  return <Card><CardHeader><CardTitle>Responsáveis</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {scopes.map(scope => {
        const assignee = assignees.find(item => item.scope === scope.value);
        return <div key={scope.value} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
          <span className="text-sm text-muted-foreground">{scope.label}</span>
          {canEdit ? <div className="space-y-1">
            <Select
              value={assignee?.user_id ?? UNASSIGNED}
              disabled={busyScope !== null}
              onValueChange={value => void change(scope.value, value, assignee?.updated_at ?? null)}
            >
              <SelectTrigger aria-label={scope.label}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                {users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {busyScope === scope.value && <p role="status" className="text-xs text-muted-foreground">Salvando responsável…</p>}
            {failure?.scope === scope.value && (
              <p role="alert" className="text-xs text-destructive">
                Alteração não salva. {failure.message}
              </p>
            )}
          </div> : <span className="text-sm font-medium">
            {assignee?.user?.name ?? "Nenhum responsável definido para esta etapa."}
          </span>}
        </div>;
      })}
    </CardContent>
  </Card>;
}
