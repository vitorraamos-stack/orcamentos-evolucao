import { useEffect, useMemo, useState } from "react";
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

const statusLabels: Record<OrderItemStatus, string> = {
  PENDING: "Pendente", IN_PROGRESS: "Em andamento", READY: "Pronto", CANCELLED: "Cancelado"
};
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  directTargetId?: string | null;
  directTargetRevisio¶»§q«^