import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderItem } from "../types/orderDetail";
// Isolate the item list from the editing dialog's Supabase repository dependency.
vi.mock("./OrderItemDialog", () => ({ OrderItemDialog: () => null }));
import { OrderItemsTab } from "./OrderItemsTab";

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
  it("separates quantities, measures and status without duplicating summary panels", () => {
    const html = view([createItem()]);
    expect(html).toContain("Placa ACM");
    expect(html).toContain("Fachada externa");
    expect(html).toContain("1 un");
    expect(html).toContain("100 × 50 cm");
    expect(html).toContain("Pendente");
    expect(html).toContain('data-slot="badge"');
    expect(html).not.toContain("Informações complementares");
  });

  it("renders every original status label accessibly", () => {
    const labels = ["Pendente", "Em andamento", "Pronto", "Cancelado"];
    const statuses = ["PENDING", "IN_PROGRESS", "READY", "CANCELLED"] as const;
    for (let i = 0; i < statuses.length; i++) {
      expect(view([createItem({ status: statuses[i] })])).toContain(labels[i]);
    }
  });

  it("keeps the original edit/remove/reorder actions gated by permissions", () => {
    const html = view([createItem(), createItem({ id: "item-2", name: "Letras PVC" })]);
    expect(html).toContain("Adicionar item");
    expect(html).toContain("Editar item 1: Placa ACM");
    expect(html).toContain("Remover item 2: Letras PVC");
    expect(html).toContain("Mover item 1 para cima");
    expect(html).toContain("Mover item 1 para baixo");
    expect(html).toContain("Mover item 2 para cima");
    expect(html).toContain("Mover item 2 para baixo");
    expect(view([createItem()], false)).not.toContain("Editar item 1");
    expect(view([createItem()], false)).not.toContain("Remover item 1");
    expect(view([createItem()], false)).not.toContain("Adicionar item");
  });

  it("renders complete dimensions when zero is supplied and hides absent measurements", () => {
    expect(view([createItem({ width_cm: 0 })])).toContain("0 × 50 cm");
    expect(view([createItem({ width_cm: null, height_cm: null })])).not.toContain(" × ");
  });

  it("preserves loading, errors and empty states", () => {
    expect(view([])).toContain("Nenhum item estruturado cadastrado");
  });

  it("announces loading accessibly without displaying an empty list", () => {
    const html = renderToStaticMarkup(
      <OrderItemsTab
        items={[]} loading error={null} canEdit={false}
        onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} onMove={vi.fn()}
      />
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Carregando itens");
    expect(html).not.toContain("Nenhum item estruturado");
  });

  it("shows a retry on query failure only when the caller offers it", () => {
    const base = {
      items: [], loading: false, error: "Conexão indisponível", canEdit: false,
      onCreate: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(), onMove: vi.fn(),
    };
    const retry = renderToStaticMarkup(<OrderItemsTab {...base} onRetry={vi.fn()} />);
    expect(retry).toContain('role="alert"');
    expect(retry).toContain("Conexão indisponível");
    expect(retry).toContain("Tentar novamente");
    const withoutRetry = renderToStaticMarkup(<OrderItemsTab {...base} />);
    expect(withoutRetry).not.toContain("Tentar novamente");
    expect(withoutRetry).not.toContain("Nenhum item estruturado");
  });
});
