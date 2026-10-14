import { useId, type Dispatch, type SetStateAction } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORK_CENTERS, WORK_CENTER_LABELS, type WorkCenter } from "@/modules/production/operations";
import type { UserOption } from "../types/orderDetail";
import type { OperationEditDraft } from "./OrderProductionTab";

/** Shared presentation for add/edit; the parent retains all operation behavior. */
export function OperationFormFields({
  draft, users, setDraft,
}: {
  draft: OperationEditDraft;
  users: UserOption[];
  setDraft: Dispatch<SetStateAction<OperationEditDraft>>;
}) {
  const id = useId();
  const centerId = `${id}-center`;
  const assigneeId = `${id}-assignee`;
  const requiredId = `${id}-required`;
  const requiredHelpId = `${id}-required-help`;
  const notesId = `${id}-notes`;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={centerId}>Setor *</Label>
          <Select value={draft.workCenter} onValueChange={value => setDraft(current => ({ ...current, workCenter: value as WorkCenter }))}>
            <SelectTrigger id={centerId} className="h-11 w-full min-w-0 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_CENTERS.map(value => <SelectItem key={value} value={value}>{WORK_CENTER_LABELS[value]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={assigneeId}>Responsável</Label>
          <Select value={draft.assigned} onValueChange={assigned => setDraft(current => ({ ...current, assigned }))}>
            <SelectTrigger id={assigneeId} className="h-11 w-full min-w-0 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não atribuído</SelectItem>
              {users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
        <Checkbox
          id={requiredId}
          checked={draft.isRequired}
          aria-describedby={requiredHelpId}
          onCheckedChange={value => setDraft(current => ({ ...current, isRequired: Boolean(value) }))}
          className="mt-0.5 size-5"
        />
        <div className="space-y-1">
          <Label htmlFor={requiredId}>Operação obrigatória</Label>
          <p id={requiredHelpId} className="text-xs text-muted-foreground">Conta para o progresso de conclusão do item.</p>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={notesId}>Observações</Label>
        <Textarea
          id={notesId}
          value={draft.notes}
          onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))}
          maxLength={4000}
          rows={4}
          placeholder="Detalhes necessários para executar esta operação"
          className="resize-y"
        />
      </div>
    </div>
  );
}
