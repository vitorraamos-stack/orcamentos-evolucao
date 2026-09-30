import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import { summarizeOrders } from "./orderSummary";

const base = {
  id: "1",
  sale_number: "OS-1",
  client_name: "Cliente",
  title: "Serviço",
  description: null,
  delivery_date: "2026-10-20",
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
  is_urgent: false,
  art_status: "Caixa de Entrada",
  prod_status: null,
  reproducao: false,
  letra_caixa: false,
  archived: false,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-29T10:00:00Z",
} satisfies OsOrder;

describe("operational order summary", () => {
  it("counts total, active, overdue, urgent and finished with existing semantics", () => {
    const orders: OsOrder[] = [
      base,
      { ...base, id: "2", delivery_date: "2026-09-20" },
      { ...base, id: "3", is_urgent: true },
      { ...base, id: "4", prod_status: "Finalizados", archived: true },
    ];
    expect(
      summarizeOrders(orders, 8, new Date("2026-09-30T12:00:00Z"))
    ).toEqual({
      total: 8,
      active: 3,
      overdue: 1,
      urgent: 1,
      finished: 1,
    });
  });

  it("keeps archived unfinished orders out of in-progress", () => {
    expect(summarizeOrders([{ ...base, archived: true }]).active).toBe(0);
  });
});
