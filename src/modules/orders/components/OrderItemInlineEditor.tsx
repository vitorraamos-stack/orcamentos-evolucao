import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { orderItemInputSchema } from "@/features/hubos/createOrderDomain";
import type { OrderItem, OrderItemStatus } from "../types/orderDetail";
import type { OrderItemInput } from "./OrderItemDialog";

function copy(item: OrderItem): OrderItemInput {
  return {
    name: item.name, description: item.description, quantity: item.quantity,
    width_cm: item.width_cm, height_cm: item.height_cm, unit: item.unit,
    notes: item.notes, status: item.status, sort_order: item.sort_order
  };
}

export function OrderItemInlineEditor({ item, onSave, onCancel, onDirtyChange }: {
  item: OrderItem;
  onSave: (id: string, input: Partial<OrderItem>, expectedUpdatedAt: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = useRef(copy(item));
  const revision = useRef(item.updated_at);
  const [draft, setDraft] = useState<OrderItemInput>(() => initial.current);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const savingRef = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const update = <K extends keyof OrderItemInput>(field: K, value: OrderItemInput[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
    setErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const number = (field: "quantity" | "width_cm" | "height_cm", value: string) => {
    update(field, (value.trim() ? Number(value) : null) as number);
  };
  const save = async () => {
    if (savingRef.current) return;
    const parsed = orderItemInputSchema.safeParse(draft);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fields[key]) fields[key] = issue.message;
      }
      setErrors(fields);
      setSaveError("Revise os campos destacados.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setErrors({});
    try {
      await onSave(item.id, parsed.data, revision.current);
      onDirtyChange(false);
      onCancel();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Erro ao salvar. Seu rascunho foi preservado.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const exit = () => {
    if (savingRef.current) return;
    if (dirty) setConfirmDiscard(true);
    else onCancel();
  };
  const inputId = (field: string) => "os-item-" + field + "-" + item.id;
  return <section aria-label={"Editar produto: " + item.name}
    className="mt-4 space-y-4 border-t pt-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={inputId("name")}>Produto</Label>
        <Input id={inputId("name")} value={draft.name} maxLength={160} disabled={saving}
          aria-invalid={Boolean(errors.name)} onChange={event => update("name", event.target.value)} />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={inputId("description")}>Descrição e especificações</Label>
        <Textarea id={inputId("description")} rows={4} value={draft.description ?? ""} maxLength={4000}
          disabled={saving} onChange={event => update("description", event.target.value || null)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId("quantity")}>Quantidade</Label>
        <Input id={inputId("quantity")} type="number" min="0.001" step="0.001" disabled={saving}
          aria-invalid={Boolean(errors.quantity)} value={draft.quantity ?? ""}
          onChange={event => number("quantity", event.target.value)} />
        {errors.quantity && <p className="text-xs text-destructive">{errors.quantity}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId("unit")}>Unidade</Label>
        <Input id={inputId("unit")} value={draft.unit} maxLength={30} disabled={saving}
          onChange={event => update("unit", event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId("width")}>Largura (cm)</Label>
        <Input id={inputId("width")} type="number" min="0.001" step="0.001" disabled={saving}
          aria-invalid={Boolean(errors.width_cm)} value={draft.width_cm ?? ""}
          onChange={event => number("width_cm", event.target.value)} />
        {errors.width_cm && <p className="text-xs text-destructive">{errors.width_cm}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId("height")}>Altura (cm)</Label>
        <Input id={inputId("height")} type="number" min="0.001" step="0.001" disabled={saving}
          aria-invalid={Boolean(errors.height_cm)} value={draft.height_cm ?? ""}
          onChange={event => number("height_cm", event.target.value)} />
        {errors.height_cm && <p className="text-xs text-destructive">{errors.height_cm}</p>}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Situação registrada</Label>
        <Select value={draft.status} disabled={saving}
          onValueChange={status => update("status", status as OrderItemStatus)}>
          <SelectTrigger aria-label="Situação do produto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
            <SelectItem value="READY">Pronto</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={inputId("notes")}>Observações</Label>
        <Textarea id={inputId("notes")} rows={3} value={draft.notes ?? ""} maxLength={4000} disabled={saving}
          onChange={event => update("notes", event.target.value || null)} />
      </div>
    </div>
    {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
    <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent">
      <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={exit}>Cancelar</Button>
      <Button type="button" className="min-h-11" disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </Button>
    </div>
    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>As alterações deste produto ainda não foram salvas.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onDirtyChange(false); onCancel(); }}>Descartar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
