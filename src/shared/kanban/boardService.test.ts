import { describe, expect, it, vi } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
vi.mock("@/features/hubos/api", () => ({
  moveOrder: vi.fn(),
  sendOrderToProduction: vi.fn(),
}));
import { moveBoardOrder } from "./boardService";

const order = (patch: Partial<OsOrder> = {}): OsOrder => ({
  id: "11111111-1111-4111-8111-111111111111",
  sale_number: "100",
  client_name: "Cliente",
  title: "Placa",
  description: null,
  delivery_date: "2026-10-10",
  delivery_deadline_preset: "CUSTOM",
  delivery_deadline_started_at: null,
  logistic_type: "retirada",
  address: null,
  production_tag: null,
  insumos_details: null,
  insumos_return_notes: null,
  insumos_requested_at: null,
  insumos_resolved_at: null,
  insumos_resolved_by: null,
  art_direction_tag: null,
  art_status: "Para Aprovação",
  prod_status: null,
  reproducao: false,
  letra_caixa: false,
  archived: false,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...patch,
});

describe("moveBoardOrder", () => {
  it("uses secure normal move for a valid transition", async () => {
    const moveOrder = vi.fn().mockResolvedValue(order());
    const sendOrderToProduction = vi.fn();
    await moveBoardOrder(
      {
        order: order({ art_status: "Em Criação" }),
        board: "art",
        to: "Para Aprovação",
        role: "arte_finalista",
        isManager: false,
      },
      { moveOrder, sendOrderToProduction }
    );
    expect(moveOrder).toHaveBeenCalledOnce();
    expect(sendOrderToProduction).not.toHaveBeenCalled();
  });
  it("rejects invalid movement before an RPC", async () => {
    const moveOrder = vi.fn(),
      sendOrderToProduction = vi.fn();
    await expect(
      moveBoardOrder(
        {
          order: order({ art_status: "Caixa de Entrada" }),
          board: "art",
          to: "Produzir",
          role: "arte_finalista",
          isManager: false,
        },
        { moveOrder, sendOrderToProduction }
      )
    ).rejects.toThrow("Movimento não permitido");
    expect(moveOrder).not.toHaveBeenCalled();
  });
  it("uses handoff contract rather than generic move", async () => {
    const moveOrder = vi.fn(),
      sendOrderToProduction = vi.fn().mockResolvedValue(order());
    await moveBoardOrder(
      {
        order: order(),
        board: "art",
        to: "Produzir",
        role: "arte_finalista",
        isManager: false,
      },
      { moveOrder, sendOrderToProduction }
    );
    expect(sendOrderToProduction).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order().id,
        deliveryDate: "2026-10-10",
      })
    );
    expect(moveOrder).not.toHaveBeenCalled();
  });
  it("isolates board roles while manager can operate production", async () => {
    const deps = {
      moveOrder: vi.fn().mockResolvedValue(order()),
      sendOrderToProduction: vi.fn(),
    };
    await expect(
      moveBoardOrder(
        {
          order: order({ prod_status: "Produção" }),
          board: "production",
          to: "Em Acabamento",
          role: "arte_finalista",
          isManager: false,
        },
        deps
      )
    ).rejects.toThrow();
    await moveBoardOrder(
      {
        order: order({ prod_status: "Produção" }),
        board: "production",
        to: "Em Acabamento",
        role: "gerente",
        isManager: true,
      },
      deps
    );
    expect(deps.moveOrder).toHaveBeenCalledOnce();
  });
});
