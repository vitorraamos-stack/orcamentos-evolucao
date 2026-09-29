import { describe, expect, it } from "vitest";
import {
  buildInstallationEvidencePath,
  sanitizeEvidenceFilename,
  validateInstallationPhoto,
} from "./installationEvidence";
describe("installation evidence", () => {
  it("builds scoped paths", () =>
    expect(
      buildInstallationEvidencePath("X", "Y", "AFTER", "foto ção.jpg", 123)
    ).toBe("os_orders/X/Instalacoes/Y/after/123_foto_cao.jpg"));
  it("sanitizes names", () =>
    expect(sanitizeEvidenceFilename("  relatório final.png")).toBe(
      "relatorio_final.png"
    ));
  it("validates mime and size", () => {
    expect(() =>
      validateInstallationPhoto({ type: "image/jpeg", size: 10 })
    ).not.toThrow();
    expect(() =>
      validateInstallationPhoto({ type: "application/pdf", size: 10 })
    ).toThrow(/Formato/);
    expect(() =>
      validateInstallationPhoto({ type: "image/png", size: 21 * 1024 * 1024 })
    ).toThrow(/20 MB/);
  });
});
