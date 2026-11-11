import { describe, expect, it } from "vitest";
import { businessDaysUntilDeadline, calculateOrderRisk, isOrderOverdue, isOrderStale } from "./risk";

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

  it("marks a near installation without ready material as critical", () => {
    expect(
      calculateOrderRisk(
        {
          delivery_date: "2026-09-19",
          logistic_type: "instalacao",
          prod_status: "Produção",
        },
        now
      )
    ).toBe("CRITICO");
  });

  it("marks near deadlines and idle orders for attention", () => {
    expect(
      calculateOrderRisk(
        { delivery_date: "2026-09-22", updated_at: "2026-09-18T09:00:00Z" },
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

  it("keeps overdue separate from general risk and excludes finished orders", () => {
    expect(
      isOrderOverdue(
        { delivery_date: "2026-09-17", prod_status: "Produção" },
        now
      )
    ).toBe(true);
    expect(
      isOrderOverdue(
        { delivery_date: "2026-09-17", prod_status: "Finalizados" },
        now
      )
    ).toBe(false);
  });

  it("counts business days across weekends and month boundaries", () => {
    const friday = new Date("2026-11-13T14:00:00Z");
    expect(businessDaysUntilDeadline("2026-11-13", friday)).toBe(0);
    expect(businessDaysUntilDeadline("2026-11-16", friday)).toBe(1);
    expect(businessDaysUntilDeadline("2026-11-17", friday)).toBe(2);
    expect(businessDaysUntilDeadline("2026-11-18", friday)).toBe(3);
    expect(businessDaysUntilDeadline("2026-11-19", friday)).toBe(4);
    expect(businessDaysUntilDeadline("2026-12-15", friday)).toBeGreaterThan(3);
    expect(businessDaysUntilDeadline("2026-11-12", friday)).toBe(-1);
    expect(businessDaysUntilDeadline(null, friday)).toBeNull();
  });

  it("keeps the same risk thresholds for ready orders and separates idle risk", () => {
    const friday = new Date("2026-11-13T14:00:00Z");
    const fresh = "2026-11-13T13:00:00Z";
    expect(calculateOrderRisk({ delivery_date: "2026-11-16", updated_at: fresh, prod_status: "Pronto / Avisar Cliente" }, friday)).toBe("CRITICO");
    expect(calculateOrderRisk({ delivery_date: "2026-11-17", updated_at: fresh }, friday)).toBe("ATENCAO");
    expect(calculateOrderRisk({ delivery_date: "2026-11-18", updated_at: fresh }, friday)).toBe("ATENCAO");
    expect(calculateOrderRisk({ delivery_date: "2026-11-19", updated_at: fresh }, friday)).toBe("NORMAL");
    const distant = { delivery_date: "2026-12-15", updated_at: "2026-11-08T10:00:00Z" };
    expect(isOrderStale(distant, friday)).toBe(true);
    expect(calculateOrderRisk(distant, friday)).toBe("ATENCAO");
    expect(isOrderStale({ ...distant, prod_status: "Finalizados" }, friday)).toBe(false);
  });
});
