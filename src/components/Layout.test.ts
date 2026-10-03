import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Layout das centrais operacionais", () => {
  it("usa toda a largura nas centrais de Arte e Produção", () => {
    const source = readFileSync(
      new URL("./Layout.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('location.startsWith("/os/arte")');
    expect(source).toContain('location.startsWith("/os/producao")');
    expect(source).toContain(
      "isArtworkCentralPage ||\n                isProductionCentralPage"
    );
  });
});
