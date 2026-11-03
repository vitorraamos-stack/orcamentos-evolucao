import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderItem, OrderItemStatus } from "../types/orderDetail";
import type { OrderItemInput } from "./OrderItemDialog";
import { orderItemInputSchema as itemInputSchema } from "@/features/hubos/createOrderDomain";

const snapshot = (item: OrderItem): OrderItemInput => ({
  name: item.name, description: item.description, quantity: item.quantity,
  width_cm: item.width_cm, height_cm: item.height_cm, unit: item.unit,
  notes: item.notes, status: item.status, sort_order: item.sort_order
});

export function OrderItemInlineEditor({ item, onSave, onCancel, onDirtyChange }: {
  item: OrderItem;
  onSave: (id: string, input: Partial<OrderItem>, expectedUpdatedAt: string) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useRef(snapshot(item));
  const revision = useRef(item.updated_at);
  const [draft, setDraft] = useState<OrderItemInput>(() => initial.current);
  const [error¶»§q«^