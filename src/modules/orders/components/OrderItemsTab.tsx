import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderItem } from "../types/orderDetail";

export type ItemDraft = { name: string; quantity: number; unit: string; status: OrderItem["status"]; sort_order: number };
type Props = { items: OrderItem[]; loading: boolean; error: string | null; canEdit: boolean; onCreate: (draft: ItemDraft) => Promise<void>; onUpdate: (id: string, input: Partial<OrderItem>) => Promise<void>; onRemove: (id: string) => Promise<void>; onMove: (index: number, direction: -1 | 1) => Promise<void> };

export function OrderItemsTab({ items, loading, error, canEdit, onCreate, onUpdate, onRemove, onMove }: Props) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  if (loading) return <p className="text-sm text-muted-foreground">Carregando itens…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return <div className="space-y-4">
    {canEdit && <Card><CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr_120px_auto] sm:items-end">
      <div><Label htmlFor="item-name">Novo item</Label><Input id="item-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Fachada ACM" /></div>
      <div><Label htmlFor="item-quantity">Quantidade</Label><Input id="item-quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
      <Button disabled={!name.trim()} onClick={async () => { await onCreate({ name, quantity: Number(quantity), unit: "un", status: "PENDING", sort_order: items.length }); setName(""); }}>Adicionar item</Button>
    </CardContent></Card>}
    {!items.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum item estruturado cadastrado.</p> : <div className="space-y-2">{items.map((item, index) => <Card key={item.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="text-sm font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1"><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.quantity} {item.unit}</p></div>
      {canEdit && <><Select value={item.status} onValueChange={status => onUpdate(item.id, { status: status as OrderItem["status"] })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDING">Pendente</SelectItem><SelectItem value="IN_PROGRESS">Em andamento</SelectItem><SelectItem value="READY">Pronto</SelectItem><SelectItem value="CANCELLED">Cancelado</SelectItem></SelectContent></Select><div className="flex"><Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Mover item para cima">↑</Button><Button variant="ghost" size="sm" disabled={index === items.length - 1} onClick={() => onMove(index, 1)} aria-label="Mover item para baixo">↓</Button></div><Button variant="ghost" size="sm" onClick={() => onRemove(item.id)}>Remover</Button></>}
    </CardContent></Card>)}</div>}
  </div>;
}
