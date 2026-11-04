import { useRef, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderItem, UserOption } from "../types/orderDetail";
import { OperationFormFields } from "./OperationFormFields";
import { OPERATION_STATUS_LABELS, WORK_CENTER_LABELS, operationSummary, type ItemOperation, type OperationStatus, type WorkCenter } from "@/modules/production/operations";

export type OperationEditInput = { workCenter: WorkCenter; assignedTo: string | null; isRequired: boolean; notes: string; sortOrder: number };
export type OperationEditDraft = Omit<OperationEditInput, "assignedTo"> & { assigned: string };

export function operationEditDraft(operation: ItemOperation): OperationEditDraft {
  return { workCenter: operation.work_center, assigned: operation.assigned_to ?? "none", isRequired: operation.is_required, notes: operation.notes ?? "", sortOrder: operation.sort_order };
}
export function operationEditInput(draft: OperationEditDraft): OperationEditInput {
  return { workCenter: draft.workCenter, assignedTo: draft.assigned === "none" ? null : draft.assigned, isRequired: draft.isRequired, notes: draft.notes, sortOrder: draft.sortOrder };
}

/** Presentation only: operational status and transition rules remain unchanged. */
const operationStatusStyles: Record<OperationStatus, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  BLOCKED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

/** Only non-blank reasons may block an operation, and not during a pending action. */
export const canConfirmOperationBlock = (reason: string, busy: boolean) =>
  !busy && Boolean(reason.trim());

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Não foi possível atualizar a operação.";
export async function runProductionAction(action: () => Promise<void>, onFailure: (message: string) => void): Promise<boolean> {
  try { await action(); return true; }
  catch (error) { onFailure(errorMessage(error)); return false; }
}

type ActionKind = "create" | "edit" | "status" | "block" | "delete";
type ActionFeedback = { kind: ActionKind; message: string; operationId?: string };

const emptyDraft: OperationEditDraft = { workCenter: "PRINTING", assigned: "none", isRequired: true, notes: "", sortOrder: 0 };

type Props = {
  items: OrderItem[]; operations: ItemOperation[]; users: UserOption[]; canOperate: boolean; canManage: boolean;
  loading?: boolean; error?: string | null; onRetry?: () => void;
  onCreate: (input: { itemId: string; workCenter: WorkCenter; assignedTo: string | null; isRequired: boolean; notes: string }) => Promise<void>;
  onUpdate: (id: string, input: OperationEditInput, expectedUpdatedAt: string) => Promise<void>;
  onStatus: (id: string, status: OperationStatus, expectedUpdatedAt: string, reason?: string) => Promise<void>;
  onDelete: (id: string, expectedUpdatedAt: string) => Promise<void>;
};

export function OrderProductionTab({ items, operations, users, canOperate, canManage, loading = false, error = null, onRetry, onCreate, onUpdate, onStatus, onDelete }: Props) {
  const [createItemId, setCreateItemId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ItemOperation | null>(null);
  const [blocking, setBlocking] = useState<ItemOperation | null>(null);
  const [deleting, setDeleting] = useState<ItemOperation | null>(null);
  const [draft, setDraft] = useState<OperationEditDraft>(emptyDraft);
  const [blockedReason, setBlockedReason] = useState("");
  const [pending, setPending] = useState<ActionFeedback | null>(null);
  const [failure, setFailure] = useState<ActionFeedback | null>(null);
  const inFlight = useRef(false);
  const busy = pending !== null;
  const act = async (feedback: ActionFeedback, action: () => Promise<void>) => {
    // A ref blocks a second click even before React commits the pending state.
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(feedback);
    setFailure(null);
    try {
      await runProductionAction(action, reason => {
        setFailure({ ...feedback, message: reason });
        toast.error(reason);
      });
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };
  const openCreate = (itemId: string) => { setFailure(null); setDraft(emptyDraft); setCreateItemId(itemId); };
  const openEdit = (operation: ItemOperation) => { setFailure(null); setDraft(operationEditDraft(operation)); setEditing(operation); };
  const statusActions = (operation: ItemOperation): { label: string; status: OperationStatus }[] => operation.status === "PENDING" ? [{ label: "Iniciar", status: "IN_PROGRESS" }] : operation.status === "IN_PROGRESS" ? [{ label: "Concluir", status: "COMPLETED" }, { label: "Bloquear", status: "BLOCKED" }] : operation.status === "BLOCKED" ? [{ label: "Retomar", status: "IN_PROGRESS" }] : canManage ? [{ label: "Reabrir", status: "IN_PROGRESS" }] : [];

  if (loading) return <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Carregando operações de produção…</p>;
  if (error) return <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 p-4"><p className="text-sm text-destructive">Não foi possível carregar a produção: {error}</p>{onRetry && <Button type="button" variant="outline" onClick={onRetry}>Tentar novamente</Button>}</div>;

  return <div className="space-y-4">
    {pending?.kind === "status" && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending.message}</p>}
    {failure?.kind === "status" && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Não foi possível atualizar a operação: {failure.message}</p>}
    {items.map((item, index) => { const values = operations.filter(value => value.item_id === item.id); const summary = operationSummary(values); return <Card key={item.id}>
      <CardHeader className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><CardTitle className="break-words text-base">Item {String(index + 1).padStart(2, "0")} — {item.name}</CardTitle>{summary.total > 0 && <p className="mt-1 text-sm text-muted-foreground">{summary.completed} de {summary.total} operações obrigatórias concluídas</p>}</div>{canOperate && <Button size="sm" className="min-h-11 w-full shrink-0 sm:min-h-9 sm:w-auto" onClick={() => openCreate(item.id)}>Adicionar operação</Button>}</CardHeader>
      <CardContent className="space-y-3">{values.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma operação de produção cadastrada.</div> : values.map(operation => <div key={operation.id} id={`os-operation-${operation.id}`} tabIndex={-1} className="rounded-lg border p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-medium">{WORK_CENTER_LABELS[operation.work_center]}</p><p className="break-words text-sm text-muted-foreground">Responsável: {users.find(user => user.id === operation.assigned_to)?.name ?? "Não atribuído"}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" data-operation-status={operation.status} className={`rounded-full ${operationStatusStyles[operation.status]}`}>{OPERATION_STATUS_LABELS[operation.status]}</Badge><span className="text-xs text-muted-foreground">{operation.is_required ? "Obrigatória" : "Opcional"}</span></div></div>
        {operation.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{operation.notes}</p>}{operation.blocked_reason && <p className="mt-2 text-sm font-medium text-destructive">Motivo: {operation.blocked_reason}</p>}{operation.completed_at && <p className="mt-1 text-xs text-muted-foreground">Concluída em {new Date(operation.completed_at).toLocaleString("pt-BR")}</p>}
        {canOperate && <div className="mt-3 flex flex-wrap gap-2">{statusActions(operation).map(action => <Button key={action.status} disabled={busy} size="sm" className="min-h-10 sm:min-h-9" aria-label={`${action.label} operação de ${WORK_CENTER_LABELS[operation.work_center]}`} variant={action.status === "BLOCKED" ? "destructive" : "outline"} onClick={() => action.status === "BLOCKED" ? (setFailure(null), setBlockedReason(""), setBlocking(operation)) : void act({ kind: "status", operationId: operation.id, message: `${action.label} operação de ${WORK_CENTER_LABELS[operation.work_center]}…` }, () => onStatus(operation.id, action.status, operation.updated_at))}>{pending?.kind === "status" && pending.operationId === operation.id ? "Processando…" : action.label}</Button>)}<Button disabled={busy} size="sm" variant="ghost" className="min-h-10 sm:min-h-9" aria-label={`Editar operação de ${WORK_CENTER_LABELS[operation.work_center]}`} onClick={() => openEdit(operation)}>Editar</Button>{canManage && <Button disabled={busy} size="sm" variant="ghost" className="min-h-10 sm:min-h-9" aria-label={`Excluir operação de ${WORK_CENTER_LABELS[operation.work_center]}`} onClick={() => { setFailure(null); setDeleting(operation); }}>Excluir</Button>}</div>}
      </div>)}</CardContent>
    </Card>; })}

    <Dialog open={Boolean(createItemId)} onOpenChange={open => { if (!open && !busy) { setCreateItemId(null); setFailure(null); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar operação</DialogTitle>
          <DialogDescription>Item: {items.find(item => item.id === createItemId)?.name ?? "Não identificado"}</DialogDescription>
        </DialogHeader>
        <OperationFormFields draft={draft} users={users} setDraft={setDraft} />
        {failure?.kind === "create" && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => { setCreateItemId(null); setFailure(null); }}>Cancelar</Button>
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => createItemId && void act({ kind: "create", message: "Adicionando operação…" }, async () => { const input = operationEditInput(draft); await onCreate({ itemId: createItemId, ...input }); setCreateItemId(null); })}>{pending?.kind === "create" ? "Adicionando…" : "Adicionar operação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !busy) { setEditing(null); setFailure(null); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar operação</DialogTitle>
          <DialogDescription>Item: {items.find(item => item.id === editing?.item_id)?.name ?? "Não identificado"}</DialogDescription>
        </DialogHeader>
        <OperationFormFields draft={draft} users={users} setDraft={setDraft} />
        {failure?.kind === "edit" && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => { setEditing(null); setFailure(null); }}>Cancelar</Button>
          <Button type="button" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => editing && void act({ kind: "edit", operationId: editing.id, message: "Salvando operação…" }, async () => { await onUpdate(editing.id, operationEditInput(draft), editing.updated_at); setEditing(null); })}>{pending?.kind === "edit" ? "Salvando…" : "Salvar alterações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(blocking)} onOpenChange={open => { if (!open && !busy) setBlocking(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-describedby="os-operation-block-context">
        <DialogHeader>
          <DialogTitle>Bloquear operação</DialogTitle>
          <DialogDescription id="os-operation-block-context">
            Setor: {blocking ? WORK_CENTER_LABELS[blocking.work_center] : "Não informado"} · Item: {items.find(item => item.id === blocking?.item_id)?.name ?? "Não identificado"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="os-operation-block-reason">Motivo do bloqueio *</Label>
          <Textarea
            id="os-operation-block-reason"
            aria-describedby="os-operation-block-help"
            aria-required="true"
            required
            value={blockedReason}
            onChange={event => setBlockedReason(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Ex.: aguardando material para continuar"
            className="resize-y"
            disabled={busy}
          />
          <p id="os-operation-block-help" className="text-xs text-muted-foreground">
            Informe o impedimento para orientar quem vai retomar a operação.
          </p>
        </div>
        {failure?.kind === "block" && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            disabled={busy}
            onClick={() => setBlocking(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 sm:min-h-9"
            disabled={!canConfirmOperationBlock(blockedReason, busy)}
            onClick={() => blocking && canConfirmOperationBlock(blockedReason, busy) && void act({ kind: "block", operationId: blocking.id, message: "Bloqueando operação…" }, async () => {
              await onStatus(blocking.id, "BLOCKED", blocking.updated_at, blockedReason.trim());
              setBlocking(null);
            })}
          >
            {busy ? "Bloqueando…" : "Confirmar bloqueio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) { setDeleting(null); setFailure(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir operação de produção?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleting ? WORK_CENTER_LABELS[deleting.work_center] : "Operação"} será excluída. Confirme para continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure?.kind === "delete" && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => deleting && void act({ kind: "delete", operationId: deleting.id, message: "Excluindo operação…" }, async () => { await onDelete(deleting.id, deleting.updated_at); setDeleting(null); })}>{pending?.kind === "delete" ? "Excluindo…" : "Confirmar exclusão"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
