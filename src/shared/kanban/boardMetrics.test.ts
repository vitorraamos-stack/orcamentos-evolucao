import { describe, expect, it } from "vitest";
import { calculateBoardMetrics } from "./boardMetrics";
import type { BoardCardModel } from "./types";

const card = (
  deliveryDate: string,
  risk: BoardCardModel["risk"]
): BoardCardModel => ({
  order: {
    id: crypto.randomUUID(),
    sale_number: "1",
    client_name: "Cliente",
    title: "OS",
    delivery_date: deliveryDate,
    delivery_deadline_preset: null,
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
    art_status: "Em Criação",
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
  },
  assignee: null,
  deadlines: [],
  itemsTotal: 0,
  itemsReady: 0,
  commentsTotal: 0,
  risk,
});

describe("board metrics overdue semantics", () => {
  it("counts yesterday as overdue", () => {
    const value = card("2000-01-01", "CRITICO");
    expect(
      calculateBoardMetrics([value], "art").find(m => m.label === "Atrasadas")
        ?.count
    ).toBe(1);
  });
  it("does not count a critical order due today as overdue", () => {
    const today = new Date().toISOString().slice(0, 10);
    const value = card(today, "CRITICO");
    expect(
      calculateBoardMetrics([value], "art").find(m => m.label === "Atrasadas")
        ?.count
    ).toBe(0);
  });
});
