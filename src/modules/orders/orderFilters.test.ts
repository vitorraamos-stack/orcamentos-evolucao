import { describe, expect, it } from "vitest";
import { matchesQuickFilter, type QuickOrderFilter } from "./orderFilters";
import type { OsOrder } from "@/features/hubos/types";

const now = new Date("2026-09-18T15:00:00Z");
const order = {
  delivery_date: "2026-09-18",
  prod_status: "Produção",
  archived: false,
  art_status: "Em Criação",
  production_tag: null,
  art_direction_tag: null,
} as OsOrder;

describe("matchesQuickFilter", () => {
  const cases: Array<[QuickOrderFilter, Partial<OsOrder>]> = [
    ["active", {}],
    ["finished", { prod_status: "Finalizados" }],
    ["today", {}],
    ["tomorrow", { delivery_date: "2026-09-19" }],
    ["week", { delivery_date: "2026-09-25" }],
    ["overdue", { delivery_date: "2026-09-17" }],
    ["urgent", { art_direction_tag: "URGENTE" }],
    ["pending", { production_tag: "AGUARDANDO_INSUMOS" }],
  ];

  it.each(cases)("matches the %s rule", (filter, patch) => {
    expect(matchesQuickFilter({ ...order, ...patch }, filter, now)).toBe(true);
  });

  it("also recognizes art adjustments as pending", () => {
    expect(
      matchesQuickFilter({ ...order, art_status: "Ajustes" }, "pending", now)
    ).toBe(true);
  });
});
