import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OrderItem, UserOption } from "../types/orderDetail";
import { OPERATION_STATUS_LABELS, WORK_CENTERS, WORK_CENTER_LABELS, operationSummary, type ItemOperation, type OperationStatus, type WorkCenter } from "@/modules/production/operations";

export type OperationEditInput = { workCenter: WorkCenter; assignedTo: string | null; isRequired: boolean; notes: string; sortOrder: number };
export type OperationEditDraft = Omit<OperationEditInput, "assignedTo"> & { assigned: string };

export function operationEditDraft(operation: ItemOperation): OperationEditDraft {
  return { workCenter: operation.work_center, assigned: operation.assigned_to ?? "none", isRequired: operation.is_required, notes: operation.notes ?? "", sortOrder: operation.sort_order };
}
export function operationEditInput(draft: OperationEditDraft): OperationEditInput {
  return { workCenter: draft.workCenter, assignedTo: draft.assigned === "none" ? null : draft.assigned, isRequired: draft.isRequired, notes: draft.notes, sortOrder: draft.sortOrder };
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível atualizar a operação.";
const emptyDraft: OperationEditDraft = { workCenter: "PRINTING", assigned: "none", isRequired: true, notes: "", sortOrder: 0 };

type Props = {
  items: OrderItem[]; operations: ItemOperation[]; users: UserOption[]; canOperate: boolean; canManage: boolean;
  onCreate: (input: { itemId: string; workCenter: WorkCenter; assignedTo: string | null; isRequired: boolean; notes: string }) => Promise<void>;
  onUpdate: (id: string, input: OperationEditInput) => Promise<void>;
  onStatus: (id: string, status: OperationStatus, reason?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function OrderProductionTab({ items, operations, users, canOperate, canManage, onCreate, onUpdate, onStatus, onDelete }: Props) {
  const [createItemId, setCreateItemId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemOperation | null>(null);
  const [blocking, setBlocking] = useState<ItemOperation | null>(null);
  const [draft, setDraft] = useState<OperationEditDraft>(emptyDraft);
  const [blockedReason, setBlockedReason] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); } };
  const openCreate = (itemId: string) => { setDraft(emptyDraft); setCreateItemId(itemId); };
  const openEdit = (operation: ItemOperation) => { setDraft(operationEditDraft(operation)); setEditing(operation); };
  const statusActions = (operation: ItemOperation): { label: string; status: OperationStatus }[] => operation.status === "PENDING" ? [{ label: "Iniciar", status: "IN_PROGRESS" }] : operation.status === "IN_PROGRESS" ? [{ label: "Concluir", status: "COMPLETED" }, { label: "Bloquear", status: "BLOCKED" }] : operation.status === "BLOCKED" ? [{ label: "Retomar", status: "IN_PROGRESS" }] : canManage ? [{ label: "Reabrir", status: "IN_PROGRESS" }] : [];

  const fields = <div className="space-y-4">
    <div><Label>Setor *</Label><Select value={draft.workCenter} onValueChange={value => setDraft(current => ({ ...current, workCenter: value as WorkCenter }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WORK_CENTERS.map(value => <SelectItem key={value} value={value}>{WORK_CENTER_LABELS[value]}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Responsável</Label><Select value={draft.assigned} onValueChange={assigned => setDraft(current => ({ ...current, assigned }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não atribuído</SelectItem>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.isRequired} onCheckedChange={value => setDraft(current => ({ ...current, isRequired: Boolean(value) }))} />Obrigatória</label>
    <div><Label>Observação</Label><Textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} maxLength={4000} rows={4} /></div>
  </div>;

  return <div className="space-y-4">
    {items.map((item, index) => { const values = operations.filter(value => value.item_id === item.id); const summary = operationSummary(values); return <Card key={item.id}>
      <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle className="text-base">Item {String(index + 1).padStart(2, "0")} — {item.name}</CardTitle>{summary.total > 0 && <p className="mt-1 text-sm text-muted-foreground">{summary.completed} de {summary.total} operações obrigatórias concluídas</p>}</div>{canOperate && <Button size="sm" onClick={() => openCreate(item.id)}>+ Adicionar operação</Button>}</CardHeader>
      <CardContent className="space-y-3">{values.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma operação de produção cadastrada.{canOperate && <div><Button variant="link" onClick={() => openCreate(item.id)}>Adicionar primeira operação</Button></div>}</div> : values.map(operation => <div key={operation.id} className="rounded-lg border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{WORK_CENTER_LABELS[operation.work_center]}</p><p className="text-sm text-muted-foreground">Responsável: {users.find(user => user.id === operation.assigned_to)?.name ?? "Não atribuído"}</p></div><div className="flex gap-1"><Badge variant={operation.status === "BLOCKED" ? "destructive" : "secondary"}>{OPERATION_STATUS_LABELS[operation.status]}</Badge><Badge variant="outline">{operation.is_required ? "Obrigatória" : "Opcional"}</Badge></div></div>
        {operation.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{operation.notes}</p>}{operation.blocked_reason && <p className="mt-2 text-sm font-medium text-destructive">Motivo: {operation.blocked_reason}</p>}{operation.completed_at && <p className="mt-1 text-xs text-muted-foreground">Concluída em {new Date(operation.completed_at).toLocaleString("pt-BR")}</p>}
        {canOperate && <div className="mt-3 flex flex-wrap gap-2">{statusActions(operation).map(action => <Button key={action.status} disabled={busy} size="sm" variant={action.status === "BLOCKED" ? "destructive" : "outline"} onClick={() => action.status === "BLOCKED" ? (setBlockedReason(""), setBlocking(operation)) : void act(() => onStatus(operation.id, action.status))}>{action.label}</Button>)}<Button disabled={busy} size="sm" variant="ghost" onClick={() => openEdit(operation)}>Editar</Button>{canManage && <Button disabled={busy} size="sm" variant="ghost" onClick={() => void act(() => onDelete(operation.id))}>Excluir</Button>}</div>}
      </div>)}</CardContent>
    </Card>; })}

    <Dialog open={Boolean(createItemId)} onOpenChange={open => !open && setCreateItemId(null)}><DialogContent><DialogHeader><DialogTitle>Adicionar operação</DialogTitle></DialogHeader>{fields}<DialogFooter><Button disabled={busy} onClick={() => createItemId && void act(async () => { const input = operationEditInput(draft); await onCreate({ itemId: createItemId, ...input }); setCreateItemId(null); })}>Adicionar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Editar operação</DialogTitle></DialogHeader>{fields}<DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={busy} onClick={() => editing && void act(async () => { await onUpdate(editing.id, operationEditInput(draft)); setEditing(null); })}>Salvar alterações</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(blocking)} onOpenChange={open => !open && setBlocking(null)}><DialogContent><DialogHeader><DialogTitle>Bloquear operação</DialogTitle></DialogHeader><div><Label>Motivo do bloqueio *</Label><Textarea value={blockedReason} onChange={event => setBlockedReason(event.target.value)} maxLength={1000} rows={4} /></div><DialogFooter><Button variant="outline" onClick={() => setBlocking(null)}>Cancelar</Button><Button variant="destructive" disabled={busy || !blockedReason.trim()} onClick={() => blocking && void act(async () => { await onStatus(blocking.id, "BLOCKED", blockedReason.trim()); setBlocking(null); })}>Bloquear operação</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
