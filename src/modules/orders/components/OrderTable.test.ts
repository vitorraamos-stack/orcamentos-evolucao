import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./OrderTable.tsx", import.meta.url),
  "utf8"
);

describe("OrderTable responsive sizing", () => {
  it("uses a minimum width fallback below wide desktop", () => {
    expect(source).toContain("min-w-[760px]");
    expect(source).toContain("overflow-x-auto");
  });

  it("releases the minimum width at xl to preserve desktop readability", () => {
    expect(source).toContain("xl:min-w-0");
  });

  it("preserves an eight-percent actions column with five primary headings", () => {
    expect(source).toContain('"OS / Cliente", "Serviço", "Etapa", "Prazo", "Ações"');
    expect(source).not.toContain("Sem responsável");
    expect(source).toContain('<col className="w-[8%]" />');
  });
});
