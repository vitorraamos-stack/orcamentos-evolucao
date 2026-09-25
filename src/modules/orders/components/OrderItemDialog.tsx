import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { itemInputSchema } from "../repositories/orderDetailRepository";
import type { OrderItem, OrderItemStatus } from "../types/orderDetail";

export type OrderItemInput = {
  name: string; description: string | null; quantity: number; width_cm: number | null;
  height_cm: number | null; unit: string; notes: string | null; status: OrderItemStatus; sort_order: number;
};
const empty = (sort_order: number): OrderItemInput => ({ name: "", description: null, quantity: 1, width_cm: null, height_cm: null, unit: "un", notes: null, status: "PENDING", sort_order });

export function OrderItemDialog({ open, onOpenChange, item, sortOrder, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; item?: OrderItem | null; sortOrder: number; onSave: (value: OrderItemInput) => Promise<void> }) {
  const [value, setValue] = useState<OrderItemInput>(empty(sortOrder));
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(item ? { name: item.name, description: item.description, quantity: item.quantity, width_cm: item.width_cm, height_cm: item.height_cm, unit: item.unit, notes: item.notes, status: item.status, sort_order: item.sort_order } : empty(sortOrder)); setError(null); }, [item, open, sortOrder]);
  const number = (field: "quantity" | "width_cm" | "height_cm", raw: string) => setValue(current => ({ ...current, [field]: raw === "" ? null : Number(raw) } as OrderItemInput));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{item ? "Editar item" : "Adicionar item"}</DialogTitle></DialogHeader><div className="grid gap-4">
    <div><Label htmlFor="item-name">Nome</Label><Input id="item-name" value={value.name} maxLength={160} onChange={e => setValue(v => ({ ...v, name: e.target.value }))} /></div>
    <div><Label htmlFor="item-description">Descrição</Label><Textarea id="item-description" value={value.description ?? ""} maxLength={4000} onChange={e => setValue(v => ({ ...v, description: e.target.value || null }))} /></div>
    <div className="grid gap-4 sm:grid-cols-3"><div><Label>Quantidade</Label><Input type="number" min="0.001" step="0.001" value={value.quantity ?? ""} onChange={e => number("quantity", e.target.value)} /></div><div><Label>Largura (cm)</Label><Input type="number" min="0.001" step="0.001" value={value.width_cm ?? ""} onChange={e => number("width_cm", e.target.value)} /></div><div><Label>Altura (cm)</Label><Input type="number" min="0.001" step="0.001" value={value.height_cm ?? ""} onChange={e => number("height_cm", e.target.value)} /></div></div>
    <div className="grid gap-4 sm:grid-cols-2"><div><Label>Unidade</Label><Input value={value.unit} maxLength={30} onChange={e => setValue(v => ({ ...v, unit: e.target.value }))} /></div><div><Label>Status</Label><Select value={value.status} onValueChange={status => setValue(v => ({ ...v, status: status as OrderItemStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pendente</SelectItem><SelectItem value="IN_PROGRESS">Em andamento</SelectItem><SelectItem value="READY">Pronto</SelectItem><SelectItem value="CANCELLED">Cancelado</SelectItem></SelectContent></Select></div></div>
    <div><Label htmlFor="item-notes">Observações</Label><Textarea id="item-notes" value={value.notes ?? ""} maxLength={4000} onChange={e => setValue(v => ({ ...v, notes: e.target.value || null }))} /></div>{error && <p className="text-sm text-destructive">{error}</p>}
  </div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} onClick={async () => { const parsed = itemInputSchema.safeParse(value); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Revise os campos."); return; } setSaving(true); try { await onSave(parsed.data as OrderItemInput); onOpenChange(false); } finally { setSaving(false); } }}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter></DialogContent></Dialog>;
}
