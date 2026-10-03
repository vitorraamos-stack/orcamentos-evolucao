import { describe, expect, it } from "vitest";
import {
  EMPTY_BOARD_FILTERS,
  type BoardCardModel,
} from "@/shared/kanban/types";
import {
  countProductionAdvancedFilters,
  formatBlockedOperations,
  formatProductionDeadline,
  getProductionCardDeadline,
} from "./productionPresentation";

describe("productionPresentation", () => {
  it("formata operações bloqueadas no singular e no plural", () => {
    expect(formatBlockedOperations(1)).toBe("1 operação bloqueada");
    expect(formatBlockedOperations(2)).toBe("2 operações bloqueadas");
    expect(formatBlockedOperations(5)).toBe("5 operações bloqueadas");
  });

  it("conta somente os nove filtros avançados", () => {
    expect(countProductionAdvancedFilters(EMPTY_BOARD_FILTERS)).toBe(0);
    expect(
      countProductionAdvancedFilters({
        ...EMPTY_BOARD_FILTERS,
        awaitingSupplies: true,
      })
    ).toBe(1);
    expect(
      countProductionAdvancedFilters({
        ...EMPTY_BOARD_FILTERS,
        workCenter: "PRINTING",
        assigneeId: "u",
        blockedOperations: true,
        myOperations: true,
        awaitingSupplies: true,
      })
    ).toBe(5);
  });
  it("usa prazo da etapa e fallback da OS", () => {
    const base = {
      order: { delivery_date: "2026-10-10" },
      deadlines: [],
    } as BoardCardModel;
    expect(getProductionCardDeadline(base)).toBe("2026-10-10");
    expect(
      getProductionCardDeadline({
        ...base,
        deadlines: [
          { scope: "PRODUCTION", dueDate: "2026-10-09", completedAt: null },
        ],
      })
    ).toBe("2026-10-09");
  });
  it("formata prazos relativos no fuso operacional", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(formatProductionDeadline(null, now)).toBe("Sem prazo");
    expect(formatProductionDeadline("2026-10-02", now)).toBe("Hoje");
    expect(formatProductionDeadline("2026-10-03", now)).toBe("Amanhã");
    expect(formatProductionDeadline("2026-10-01", now)).toBe(
      "Atrasado há 1 dia"
    );
    expect(formatProductionDeadline("2026-10-10", now)).toBe("10/10/2026");
  });
});
