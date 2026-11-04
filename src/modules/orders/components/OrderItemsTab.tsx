import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { OrderItem, OrderItemStatus } from "../types/orderDetail";
import { OrderItemDialog, type OrderItemInput } from "./OrderItemDialog";
import { OrderItemInlineEditor } from "./OrderItemInlineEditor";

export type ItemDraft = OrderItemInput;

const statuses: Record<OrderItemStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendente", className: "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300" },
  IN_PROGRESS: { label: "Em andamento", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  READY: { label: "Pronto", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  CANCELLED: { label: "Cancelado", className: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" },
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const PAGE_SIZE = 15;
type Props = {
  items: OrderItem[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  canEdit: boolean;
  onCreate: (draft: ItemDraft) => Promise<void>;
  onUpdate: (id: string, input: Partial<OrderItem>, expectedUpdatedAt: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => Promise<void>;
  onUnsavedChange?: (dirty: boolean) => void;
  directTargetId?: string | null;
  directTargetRevision?: number;
};

export function OrderItemsTab({
  items, loading, error, onRetry, canEdit, onCreate, onUpdate, onRemove, onMove,
  onUnsavedChange, directTargetId, directTargetRevision,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [removing, setRemoving] = useState<OrderItem | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const lastScrollRevision = useRef(-1);

  useEffect(() => { onUnsavedChange?.(dirty); }, [dirty, onUnsavedChange]);
  useEffect(() => () => onUnsavedChange?.(false), [onUnsavedChange]);

  useEffect(() => {
    if (!directTargetId || dirty) return;
    const position = items.findIndex(item => item.id === directTargetId);
    if (position < 0) return;
    setQuery("");
    setStatusFilter("all");
    setLimit(Math.max(PAGE_SIZE, position + 1));
    setExpandedId(directTargetId);
  }, [directTargetId, directTargetRevision, items, dirty]);

  const results = useMemo(() => {
    const needle = normalize(query.trim());
    return items.filter(item => {
      return (statusFilter === "all" || item.status === statusFilter) &&
        (!needle || normalize([item.name, item.description || "", item.notes || ""].join(" ")).includes(needle));
    });
  }, [items, query, statusFilter]);

  // Never unmount a dirty editor when filters or pagination change.
  const page = results.slice(0, limit);
  const pinned = editingId && dirty ? items.find(item => item.id === editingId) : undefined;
  const displayed = pinned && !page.some(item => item.id === pinned.id) ? [pinned, ...page] : page;
  const filtersActive = Boolean(query.trim() || statusFilter !== "all");

  useEffect(() => {
    if (!directTargetId || lastScrollRevision.current === directTargetRevision) return;
    const node = document.getElementById("os-item-" + directTargetId);
    if (!node) return;
    lastScrollRevision.current = directTargetRevision ?? -1;
    node.scrollIntoView({ block: "center" });
  }, [directTargetId, directTargetRevision, limit]);

  const removeConfirmed = async () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    setRemoveError(null);
    try {
      await onRemove(removing.id);
      setRemoving(null);
    } catch (failure) {
      setRemoveError(failure instanceof Error ? failure.message : "Não foi possível remover. Tente novamente.");
    } finally {
      setRemovingBusy(false);
    }
  };
  const openEditor = (item: OrderItem) => {
    if (dirty && editingId && editingId !== item.id) return;
    setExpandedId(item.id);
    setEditingId(item.id);
  };

  if (loading && items.length === 0) return <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Carregando itens…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
    <p className="min-w-0 break-words text-sm text-destructive">Não foi possível carregar os itens: {error}</p>
    {onRetry && <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onRetry}>Tentar novamente</Button>}
  </div>;
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-[210px] flex-1 flex-wrap gap-3">
        <div className="min-w-[170px] flex-[2] space-y-1">
          <Label htmlFor="os-items-search">Pesquisar produtos</Label>
          <Input id="os-items-search" className="min-h-11" value={query} placeholder="Nome, descrição ou observação"
            onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
        </div>
        <div className="min-w-[150px] flex-1 space-y-1">
          <Label htmlFor="os-items-status">Situação</Label>
          <select id="os-items-status" className="flex min-h-11 w-full rounded-md border bg-background px-3 text-sm"
            value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setLimit(PAGE_SIZE); }}>
            <option value="all">Todas</option>
            <option value="PENDING">Pendente</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="READY">Pronto</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      </div>
      {canEdit && <Button type="button" className="min-h-11" disabled={Boolean(dirty)}
        onClick={() => setCreateOpen(true)}>Adicionar item</Button>}
    </div>

    {!items.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      Nenhum item estruturado cadastrado.
    </p> : !displayed.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      Nenhum produto corresponde aos filtros selecionados.
    </p> : <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{results.length} de {items.length} produto(s) encontrados</p>
      {filtersActive && <p className="text-xs text-muted-foreground">Limpe os filtros para reordenar produtos.</p>}
      {displayed.map(item => {
        const index = items.findIndex(current => current.id === item.id);
        const status = statuses[item.status];
        const isExpanded = expandedId === item.id;
        const isEditing = editingId === item.id;
        const hasMeasures = item.width_cm != null || item.height_cm != null;
        return <Card key={item.id} id={"os-item-" + item.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span aria-hidden="true" className="pt-1 text-sm font-bold text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <button type="button" aria-expanded={isExpanded}
                  aria-label={"Detalhes do produto " + (index + 1) + ": " + item.name}
                  className="flex min-h-9 w-full items-center gap-2 break-words text-left font-semibold"
                  onClick={() => { if (!isEditing) setExpandedId(isExpanded ? null : item.id); }}>
                  {item.name}
                  {isExpanded ? <ChevronUp aria-hidden="true" className="size-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="size-4 shrink-0" />}
                </button>
                {item.description && <p className="line-clamp-2 break-words text-sm text-muted-foreground" title={item.description}>
                  {item.description}
                </p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-sm text-muted-foreground"><span className="sr-only">Quantidade: </span>{item.quantity} {item.unit}</span>
                  {hasMeasures && <span className="text-sm text-muted-foreground">
                    <span className="sr-only">Medidas: </span>{item.width_cm ?? "—"} × {item.height_cm ?? "—"} cm
                  </span>}
                  <Badge variant="outline" className={"rounded-full " + status.className}>{status.label}</Badge>
                </div>
              </div>
              {canEdit && <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9"
                  aria-label={"Editar item " + (index + 1) + ": " + item.name}
                  disabled={Boolean(dirty && editingId !== item.id)} onClick={() => openEditor(item)}>Editar</Button>
                <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                  aria-label={"Mover item " + (index + 1) + " para cima"} title="Mover para cima"
                  disabled={filtersActive || dirty || index === 0} onClick={() => void onMove(index, -1)}>
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                  aria-label={"Mover item " + (index + 1) + " para baixo"} title="Mover para baixo"
                  disabled={filtersActive || dirty || index === items.length - 1} onClick={() => void onMove(index, 1)}>
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9"
                  aria-label={"Remover item " + (index + 1) + ": " + item.name}
                  disabled={dirty} onClick={() => { setRemoving(item); setRemoveError(null); }}>Remover</Button>
              </div>}
            </div>
            {isExpanded && !isEditing && <div className="space-y-2 border-t pt-3 text-sm">
              <p className="font-semibold">Especificações completas</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{item.description || "Descrição não informada."}</p>
              {item.notes && <p className="whitespace-pre-wrap break-words"><strong>Observações:</strong> {item.notes}</p>}
            </div>}
            {isEditing && canEdit && <OrderItemInlineEditor key={item.id} item={item}
              onSave={onUpdate} onDirtyChange={setDirty}
              onCancel={() => { setEditingId(null); setDirty(false); }} />}
          </CardContent>
        </Card>;
      })}
      {results.length > limit && <Button type="button" variant="outline" className="min-h-11"
        onClick={() => setLimit(current => current + PAGE_SIZE)}>Mostrar mais produtos</Button>}
    </div>}

    {createOpen && <OrderItemDialog open={createOpen} onOpenChange={setCreateOpen} item={null}
      sortOrder={items.length} onSave={onCreate} onDirtyChange={setDirty} />}
    <AlertDialog open={Boolean(removing)} onOpenChange={next => { if (!next && !removingBusy) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover item?</AlertDialogTitle>
          <AlertDialogDescription>Deseja remover o item “{removing?.name}”? A exclusão será registrada no histórico.</AlertDialogDescription>
        </AlertDialogHeader>
        {removeError && <p role="alert" className="text-sm text-destructive">{removeError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removingBusy}>Cancelar</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={removingBusy}
            onClick={() => void removeConfirmed()}>{removingBusy ? "Removendo…" : "Remover"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
