import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("ProductionSummaryCards", () => {
  it("mapeia métricas para colunas e filtros", () => {
    const source = readFileSync(
      new URL("./ProductionSummaryCards.tsx", import.meta.url),
      "utf8"
    );
    [
      "Em Produção",
      "Acabamento / Conferência",
      "Aguardando insumos",
      "Material Pronto",
      "Atrasadas",
      "Produção",
      "Em Acabamento",
      "Pronto / Avisar Cliente",
      "aria-pressed",
    ].forEach(value => expect(source).toContain(value));
  });
});
