import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ArtworkSummaryCards", () => {
  it("mapeia indicadores de etapa e prioridade para ações", () => {
    const source = readFileSync("src/modules/artwork/components/ArtworkSummaryCards.tsx", "utf8");
    expect(source).toContain('onFocus("Em Criação")');
    expect(source).toContain('onFocus("Para Aprovação")');
    expect(source).toContain("onUrgent");
    expect(source).toContain("onOverdue");
    expect(source).toContain("aria-pressed");
  });
});
