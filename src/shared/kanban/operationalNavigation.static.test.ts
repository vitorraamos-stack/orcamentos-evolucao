import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../components/Layout.tsx", import.meta.url), "utf8");

describe("Fase 3.2 operational navigation", () => {
  it.each([
    "/os/arte/aprovacoes",
    "/os/arte/revisoes",
  ])("redirects the old art route %s", route => {
    const block = app.slice(app.indexOf(`<Route path=\"${route}\">`), app.indexOf(`<Route path=\"${route}\">`) + 160);
    expect(block).toContain('<Redirect to="/os/arte" />');
  });

  it.each([
    "/os/producao/impressao",
    "/os/producao/acabamento",
    "/os/producao/letra-caixa",
    "/os/producao/externa",
    "/os/producao/pronto",
  ])("keeps old production bookmark %s in the redirect list", route => {
    expect(app).toContain(`\"${route}\"`);
  });

  it("keeps only the two compact board destinations in the sidebar", () => {
    expect(layout).toContain('["/os/arte", "Arte", Palette]');
    expect(layout).toContain('["/os/producao", "Produção", Factory]');
    expect(layout).not.toContain('"Aprovações"');
    expect(layout).not.toContain('"Quadro Geral"');
    expect(layout).not.toContain('"Produção Externa"');
  });
});
