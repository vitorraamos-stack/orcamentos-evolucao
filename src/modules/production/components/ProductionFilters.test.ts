import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_BOARD_FILTERS } from "@/shared/kanban/types";
import { clearProductionFilters } from "./ProductionFilters";

describe("ProductionFilters", () => {
  it("limpa todo filtro, inclusive estados invisíveis", () => {
    const result = clearProductionFilters({
      ...EMPTY_BOARD_FILTERS,
      search: "x",
      mine: true,
      urgent: true,
      artTag: "x",
      overdue: true,
      awaitingSupplies: true,
      external: true,
      reproducao: true,
      letraCaixa: true,
      workCenter: "PRINTING",
      blockedOperations: true,
      myOperations: true,
      assigneeId: "u",
    });
    expect(result).toEqual(EMPTY_BOARD_FILTERS);
  });
  it("preserva todos os controles operacionais", () => {
    const source = readFileSync(
      new URL("./ProductionFilters.tsx", import.meta.url),
      "utf8"
    );
    [
      "Responsável",
      "Setor",
      "Atrasadas",
      "Aguardando insumos",
      "Produção externa",
      "Reprodução",
      "Letra Caixa",
      "Bloqueados",
      "Minhas operações",
      "Minhas OS",
    ].forEach(label => expect(source).toContain(label));
  });
});
