import { describe, expect, it } from "vitest";
import { formatOfficialOsLabel } from "./orderOfficialNumber";

describe("OS official number (presentation only)", () => {
  it("uses the Conta Azul sale number", () => {
    expect(formatOfficialOsLabel("85478")).toBe("OS #85478");
    expect(formatOfficialOsLabel(85478)).toBe("OS #85478");
  });

  it("never displays a fabricated number when missing", () => {
    expect(formatOfficialOsLabel(null)).toBe("Número não informado");
    expect(formatOfficialOsLabel(undefined)).toBe("Número não informado");
    expect(formatOfficialOsLabel("")).toBe("Número não informado");
    expect(formatOfficialOsLabel("  ")).toBe("Número não informado");
  });
});
