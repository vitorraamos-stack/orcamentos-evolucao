import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OsOrder, OsOrderLayoutAsset } from "@/features/hubos/types";
import type { OrderItem } from "../types/orderDetail";
import { Button } from "@/components/ui/button";
import { OrderReferencePreview } from "./OrderReferencePreview";

const field = (label: string, value: React.ReactNode) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
      {value || "â€”"}
    </dd>
  </div>
);

export function OrderSummaryTab({ order, items, itemsLoaded, onGoItems, onGoItem, referenceAsset, onRequestReferenceUrl }: {
  order: OsOrder;
  items?: OrderItem[];
  itemsLoaded?: boolean;
  onGoItems?: () => void;
  onGoItem?: (itemId: string) => void;
  referenceAsset?: OsOrderLayoutAsset | null;
  onRequestReferenceUrl?: (asset: OsOrderLayoutAsset) => Promise<string>;
}) {
  // The header already provides the client, OS number, title, current stage,
  // priority, contracted deadline, general assignee and logistics.
  const briefing = order.description?.trim() ?? "";
  const hasSeparateBriefing = Boolean(briefing && order.title?.trim() && briefing !== order.title.trim());
  const showAddress =
    order.logistic_type !== "retirada" || Boolean(order.address?.trim());

  return (
    <div className="min-w-0 space-y-4">
    <Card className="min-w-0">
      <CardHeader>
        <CardTit¶»§q«^