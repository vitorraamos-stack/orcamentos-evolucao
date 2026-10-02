import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ArtworkQuickView", () => {
  it("usa Sheet acessível, dados carregados e callback de movimento", () => {
    const source = readFileSync("src/modules/artwork/components/ArtworkQuickView.tsx", "utf8");
    expect(source).toContain("SheetTitle");
    expect(source).toContain("SheetDescription");
    expect(source).toContain("onMove(value as BoardStatus)");
    expect(source).toContain("Abrir OS completa");
  });
});
