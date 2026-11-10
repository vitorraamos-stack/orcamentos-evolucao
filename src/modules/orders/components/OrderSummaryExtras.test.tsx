import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderItem } from "../types/orderDetail";
import { OrderSummaryExtras } from "./OrderSummaryExtras";

const item = (id: string): OrderItem => ({
  id, order_id: "order-1", name: "Letreiro de acrílico " + id,
  description: "Frente iluminada", quantity: 2, unit: "un",
  width_cm: 40, height_cm: 15, notes: null, status: "PENDING",
  sort_order: 0, created_at: "", updated_at: "",
  created_by: null, deleted_at: null
});
function render({
  items = [item("one")],
  itemsLoaded = true,
  itemsError = null as string | null
} = {}) {
  return renderToStaticMarkup(<OrderSummaryExtras items={items} itemsLoaded={itemsLoaded}
    itemsError={itemsError} onGoItems={vi.fn()} onGoItem={vi.fn()} />);
}

describe("OS summary supplemental sections", () => {
  it("uses real item fields and guides to the full list without duplicating the header", () => {
    const html = render();
    expect(html).toContain("Produtos da OS");
    expect(html).toContain("Letreiro de acrílico one");
    expect(html).toContain("Frente iluminada");
    expect(html).toContain("2 un");
    expect(html).toContain("Ver todos os itens");
    expect(html).not.toContain("Cliente não informado");
  });
  it("limits summary preview to five products", () => {
    const html = render({ items: Array.from({ length: 8 }, (_, i) => item(String(i))) });
    expect(html).toContain("Mais 3 produto(s)");
    expect(html).not.toContain("Letreiro de acrílico 7");
  });
  it("removes the unused visual reference card while retaining products", () => {
    const html = render();
    expect(html).toContain("Produtos da OS");
    expect(html).not.toContain("Referência visual");
    expect(html).not.toContain("Visualizar imagem");
  });
  it("states incomplete or unavailable data rather than showing an invented product", () => {
    expect(render({ itemsLoaded: false })).toContain("Carregando produtos cadastrados");
    expect(render({ itemsError: "Network" })).toContain("Lista indisponível");
  });
});
