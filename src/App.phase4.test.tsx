import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("phase 4 navigation", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  it("routes installations to the operational page", () => {
    expect(app).toContain('path="/instalacoes"');
    expect(app).toContain("<InstallationsPage />");
  });
  it("routes deliveries to the operational page", () => {
    expect(app).toContain('path="/entregas"');
    expect(app).toContain("<DeliveriesPage />");
  });
});
