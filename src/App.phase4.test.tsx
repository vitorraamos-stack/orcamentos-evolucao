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
  it("renders focused art and production routes with real presets", () => {
    expect(app).toContain('<ArtworkBoardPage preset="approvals" />');
    expect(app).toContain('<ArtworkBoardPage preset="revisions" />');
    expect(app).toContain('["/os/producao/em-producao", "production"]');
    expect(app).toContain('["/os/producao/acabamento", "finishing"]');
    expect(app).toContain('["/os/producao/insumos", "supplies"]');
    expect(app).toContain('["/os/producao/externa", "external"]');
    expect(app).toContain('["/os/producao/pronto", "ready"]');
    expect(app).not.toContain('<Redirect to="/os/producao" />');
  });
});
