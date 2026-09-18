import { describe, expect, it } from "vitest";
import { calculateOrderRisk } from "./risk";

const now = new Date("2026-09-18T10:00:00Z");

describe("calculateOrderRisk", () => {
  it("marks overdue and unfinished orders as critical", () => {
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-09-17", prod_status: "Em Produção" },
        now
      )
    ).toBe("CRITICO");
  });

  it("marks an unfinished order due today as critical", () => {
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-09-18", prod_status: "Produção" },
        now
      )
    ).toBe("CRITICO");
  });

  it("marks near deadlines and idle orders for attention", () => {
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-09-20", updated_at: "2026-09-18T09:00:00Z" },
        now
      )
    ).toBe("ATENCAO");
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-10-20", updated_at: "2026-09-10T09:00:00Z" },
        now
      )
    ).toBe("ATENCAO");
  });

  it("keeps finished and healthy orders normal", () => {
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-09-10", prod_status: "Finalizados" },
        now
      )
    ).toBe("NORMAL");
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-10-20", updated_at: "2026-09-18T09:00:00Z" },
        now
      )
    ).toBe("NORMAL");
  });
});
