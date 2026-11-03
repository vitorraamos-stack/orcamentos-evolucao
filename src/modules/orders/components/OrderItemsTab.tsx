import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { OrderItem, OrderItemStatus } from "../types/orderDetail";
import { OrderItemDialog, type OrderItemInput } from "./OrderItemDialog";

export type ItemDraft = OrderItemInput;

const statuses: Record<OrderItemStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendente", className: "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300" },
  IN_PROGRESS: { label: "Em andamento", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  READY: { label: "Pronto", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  CANCELLED: { label: "Cancelado", className: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" },
};

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
};

export function OrderItemsTab({
  items, loading, error, onRetry, canEdit, onCreate, onUpdate, onRemove, onMove,
}: Props) {
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<OrderItem | null>(null);
  const [removing, setRemoving] = useState<OrderItem | null>(null);

  if (loading) return <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Carregando itens…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
    <p className="min-w-0 break-words text-sm text-destructive">Não foi possível carregar os itens: {error}</p>
    {onRetry && <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onRetry}>Tentar novamente</Button>}
  </div>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button className="min-h-11 sm:min-h-9" onClick={() => { setSelected(null); setDialog("create"); }}>
            Adicionar item
          </Button>
        </div>
      )}
      {!items.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum item estruturado cadastrado.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const status = statuses[item.status];
            const hasMeasures = item.width_cm != null || item.height_cm != null;
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <span aria-hidden="true" className="text-sm font-bold text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="break-words font-semibold">{item.name}</p>
                    {item.description && (
                      <p className="line-clamp-2 break-words text-sm text-muted-foreground" title={item.description}>
                        {item.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-sm text-muted-foreground">
                        <span className="sr-only">Quantidade: </span>
                        {item.quantity} {item.unit}
                      </span>
                      {hasMeasures && (
                        <span className="text-sm text-muted-foreground">
                          <span className="sr-only">Medidas: </span>
                          {item.width_cm ?? "—"} × {item.height_cm ?? "—"} cm
                        </span>
                      )}
                      <Badge variant="outline" className={`rounded-full ${status.className}`}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        aria-label={`Editar item ${index + 1}: ${item.name}`}
                        onClick={() => { setSelected(item); setDialog("edit"); }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                        aria-label={`Mover item ${index + 1} para cima`}
                        title="Mover para cima"
                        disabled={index === 0}
                        onClick={() => onMove(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
                        aria-label={`Mover item ${index + 1} para baixo`}
                        title="Mover para baixo"
                        disabled={index === items.length - 1}
                        onClick={() => onMove(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        aria-label={`Remover item ${index + 1}: ${item.name}`}
                        onClick={() => setRemoving(item)}
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <OrderItemDialog
        open={dialog !== null}
        onOpenChange={open => !open && setDialog(null)}
        item={selected}
        sortOrder={items.length}
        onSave={value => selected ? onUpdate(selected.id, value, selected.updated_at) : onCreate(value)}
      />
      <AlertDialog open={Boolean(removing)} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover o item “{removing?.name}”? Esta exclusão será registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && onRemove(removing.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
