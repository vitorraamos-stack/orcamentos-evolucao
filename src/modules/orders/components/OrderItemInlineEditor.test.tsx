import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderItem } from "../types/orderDetail";
import { OrderItemInlineEditor } from "./OrderItemInlineEditor";
const source = readFileSync(new URL("./OrderItemInlineEditor.tsx", import.meta.url), "utf8");
const item: OrderItem = {
  id: "item-one", order_id: "order-one", name: "Placa PVC", description: "Branco",
  quantity: 2, width_cm: 120, height_cm: 60, unit: "un", notes: "Instalar em parede",
  status: "IN_PROGRESS", sort_order: 0, created_at: "", updated_at: "revision-123",
  created_by: null, deleted_at: null
};
describe("OS guarded contextual item editor", () => {
  it("renders complete editable values and explicit save and cancel buttons", () => {
    const html = renderToStaticMarkup(<OrderItemInlineEditor item={item}
      onSave={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} />);
    for(const value of ["Placa PVC", "Branco", "Instalar em parede", "Salvar alterações", "Cancelar"]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("120");
    expect(html).toContain("60");
  });
  it("retains original revision for optimistic concurrency and does not clear draft after failure", () => {
    expect(source).toContain("revision.current");
    expect(source).toContain("await onSave(item.id, parsed.data, revision.current)");
    expect(source).toContain("setSaveError(");
    expect(source).toContain("onDirtyChange(false);");
    expect(source).toContain("orderItemInputSchema.safeParse(draft)");
  });
});
