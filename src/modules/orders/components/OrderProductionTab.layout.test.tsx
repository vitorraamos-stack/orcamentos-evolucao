import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderItem, UserOption } from "../types/orderDetail";
import type { ItemOperation } from "@/modules/production/operations";
import { OrderProductionTab } from "./OrderProductionTab";

const item: OrderItem = {
  id: "i-1", order_id: "os-1", name: "Letreiro ACM", description: null,
  quantity: 1, width_cm: null, height_cm: null, unit: "un", notes: null,
  status: "PENDING", sort_order: 0, created_at: "", updated_at: "",
  created_by: null, deleted_at: null,
};

const operation: ItemOperation = {
  id: "op-1", item_id: "i-1", work_center: "PRINTING", status: "PENDING",
  assigned_to: null, is_required: true, notes: null, blocked_reason: null,
  sort_order: 0, started_at: null, completed_at: null,
  created_at: "", updated_at: "",
};

const users: UserOption[] = [{ id: "u-1", name: "Operador", email: null }];
const render = (ops: ItemOperation[], canOperate = true, canManage = false) =>
  renderToStaticMarkup(
    <OrderProductionTab
      items={[item]} operations={ops} users={users}
      canOperate={canOperate} canManage={canManage}
      onCreate={vi.fn()} onUpdate={vi.fn()} onStatus={vi.fn()} onDelete={vi.fn()}
    />
  );

describe("EvoluSystem OS production layout", () => {
  it("does not repeat the add-operation action in the empty state", () => {
    const html = render([]);
    expect(html).toContain("Nenhuma operação de produção cadastrada.");
    expect(html.match(/Adicionar operação/g)).toHaveLength(1);
    expect(html).not.toContain("Adicionar primeira operação");
    expect(render([], false)).not.toContain("Adicionar operação");
  });

  it("presents all four operation statuses clearly and maintains required/optional wording", () => {
    for (const [status, label] of [
      ["PENDING", "Pendente"], ["IN_PROGRESS", "Em andamento"],
      ["COMPLETED", "Concluído"], ["BLOCKED", "Bloqueado"],
    ] as const) {
      const html = render([{ ...operation, status, is_required: false }]);
      expect(html).toContain(`data-operation-status="${status}"`);
      expect(html).toContain(label);
      expect(html).toContain("Opcional");
    }
    const html = render([operation]);
    expect(html).toContain("Obrigatória");
    expect(html).toContain("0 de 1 operações obrigatórias concluídas");
    expect(html).toContain("Responsável: Não atribuído");
  });

  it("preserves permission restrictions and the existing status transitions", () => {
    const html = render([{ ...operation, status: "IN_PROGRESS" }], true, false);
    expect(html).toContain("Concluir operação de Impressão");
    expect(html).toContain("Bloquear operação de Impressão");
    expect(html).toContain("Editar operação de Impressão");
    expect(html).not.toContain("Excluir operação de Impressão");
    expect(render([operation], true, true)).toContain("Excluir operação de Impressão");
    expect(render([operation], false)).not.toContain("Editar operação de Impressão");
    expect(render([operation], false)).not.toContain("Iniciar operação de Impressão");
  });

  it("keeps the completion summary focused on required operations", () => {
    const html = render([
      { ...operation, id: "op-required", status: "COMPLETED" },
      { ...operation, id: "op-optional", status: "BLOCKED", is_required: false },
    ]);
    expect(html).toContain("1 de 1 operações obrigatórias concluídas");
    expect(html).toContain("Bloqueado");
  });
});
