import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("ProductionQuickView", () => {
  it("apresenta o resumo operacional e movimento permitido", () => {
    const source = readFileSync(
      new URL("./ProductionQuickView.tsx", import.meta.url),
      "utf8"
    );
    [
      "SheetTitle",
      "Responsável",
      "Prazo",
      "Operações",
      "Centros de trabalho",
      "Itens prontos",
      "Abrir OS completa",
      "onMove(value as BoardStatus)",
    ].forEach(value => expect(source).toContain(value));
  });
});
