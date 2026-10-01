import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("./AwaitingSuppliesPage.tsx", import.meta.url),
  "utf8"
);
describe("AwaitingSuppliesPage", () => {
  it("provides the dedicated queue, canonical resolution and permission gate", () => {
    expect(source).toContain("Aguardando Insumos");
    expect(source).toContain('updateOrderInsumos(selected.id, "RESOLVE"');
    expect(source).toContain("hubPermissions.canMoveProducaoBoard");
    expect(source).toContain("Nenhuma OS aguardando insumos.");
  });
});
