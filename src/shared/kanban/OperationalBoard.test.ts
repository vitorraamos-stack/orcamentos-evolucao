import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OperationalBoard.tsx", import.meta.url),
  "utf8"
);

describe("OperationalBoard focused views", () => {
  it("provides contextual titles for every art and production preset", () => {
    [
      "Arte · Aguardando aprovação",
      "Arte · Ajustes",
      "Produção · Em produção",
      "Produção · Impressão",
      "Produção · Em acabamento",
      "Produção · Letra caixa",
      "Produção · Aguardando insumos",
      "Produção · Produção externa",
      "Produção · Material pronto",
    ].forEach(title => expect(source).toContain(title));
  });

  it("links focused views back to the complete SPA board", () => {
    expect(source).toContain('preset !== "all"');
    expect(source).toContain("Ver quadro completo");
    expect(source).toContain('board === "art" ? "/os/arte" : "/os/producao"');
  });
});
