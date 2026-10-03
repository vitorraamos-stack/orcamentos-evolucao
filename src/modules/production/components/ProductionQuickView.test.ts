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

  it("mantém cabeçalho e rodapé fora da região rolável interna", () => {
    const source = readFileSync(
      new URL("./ProductionQuickView.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain(
      'SheetContent className="w-full overflow-hidden sm:max-w-md"'
    );
    expect(source).toContain('SheetHeader className="shrink-0"');
    expect(source).toContain(
      'className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4"'
    );
    expect(source).toMatch(
      /<\/div>\s*<SheetFooter className="shrink-0">[\s\S]*Abrir OS completa/
    );
  });
});
