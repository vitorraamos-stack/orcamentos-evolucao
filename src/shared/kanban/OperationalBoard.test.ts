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
      "Arte · Arte em andamento",
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
  it("remove as setas laterais dos quadros de Arte e Produção, preservando a rolagem nativa", () => {
    expect(source).not.toContain('aria-label="Rolar quadro para a esquerda"');
    expect(source).not.toContain('aria-label="Rolar quadro para a direita"');
    expect(source).not.toContain('ChevronLeft');
    expect(source).not.toContain('ChevronRight');
    expect(source).not.toContain('boardScrollRef');
    expect(source).toContain('className="flex gap-4 overflow-x-auto pb-4"');
    expect(source).toContain('onDragEnd={event => {');
  });

  it("usa componentes especializados e colunas modernas nos dois quadros", () => {
    [
      "ArtworkSummaryCards",
      "ArtworkFilters",
      "ArtworkQuickView",
      "ProductionSummaryCards",
      "ProductionFilters",
      "ProductionQuickView",
    ].forEach(component => expect(source).toContain(component));
    expect(source).toContain('variant="modern"');
    expect(source).toContain('board === "production" && canMove');
    expect(source).not.toContain("queuePositions.get(card.order.id)");
    expect(source).toContain('stretch={board === "art"}');
  });
});
