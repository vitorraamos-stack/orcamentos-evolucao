import { describe, expect, it } from "vitest";
import { formatOfficialOsLabel } from "./orderOfficialNumber";
describe("OS official number", () => {
  it("uses Conta Azul", () => {
    expect(formatOfficialOsLabel("85478")).toBe("OS #85478");
    expect(formatOfficialOsLabel(85478)).toBe("OS #85478");
  });
  it("does not invent identifiers", () => {
    for (const value of [null, undefined, "", "  "]) {
      expect(formatOfficialOsLabel(value)).toBe("Número não informado");
    }
  });
});
