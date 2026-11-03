import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderItem } from "../types/orderDetail";
// Isolate the item list from the editing dialog's Supabase repository dependency.
vi.mock("./OrderItemDialog", () => ({ OrderItemDialog: () => null }));
import { OrderItemsTab } from "./OrderItemsTab";

const itemsSource = readFileSync(new URL("./OrderItemsTab.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("./OrderItemInlineEditor.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");

const createItem = (changes: Partial<OrderItem> = {}): OrderItem => ({
  id: "item-1", order_id: "order-1", name: "Placa ACM", description: "Fachada externa",
  quantity: 1, unit: "un", width_cm: 100, height_cm: 50, notes: null,
  status: "PENDING", sort_order: 0, created_at: "2026-10-14T12:00:00Z",
  updated_at: "2026-10-14T12:00:00Z", created_by: null, deleted_at: null,
  ...changes,
});

function view(items: OrderItem[], canEdit = true) {
  return renderToStaticMarkup(
    <OrderItemsTab
      items={items}
      loading={false}
      error={null}
      canEdit={canEdit}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
      onMove={vi.fn()}
    />
  );
}

describe("EvoluSystem OS item readability", () => {
  it("separates quantities, measures and status without ¶»§q«^