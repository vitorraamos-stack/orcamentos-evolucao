import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const layout = readFileSync(
  new URL("../../components/Layout.tsx", import.meta.url),
  "utf8"
);

describe("Fase 3.2 operational navigation", () => {
  it.each([
    ["/os/arte/aprovacoes", "approvals"],
    ["/os/arte/revisoes", "revisions"],
  ])("renders the focused art route %s", (route, preset) => {
    const start = app.indexOf(`<Route path=\"${route}\">`);
    const block = app.slice(start, start + 320);
    expect(block).toContain(`<ArtworkBoardPage preset=\"${preset}\" />`);
    expect(block).not.toContain('<Redirect to="/os/arte" />');
  });

  it.each([
    "/os/producao/impressao",
    "/os/producao/acabamento",
    "/os/producao/letra-caixa",
    "/os/producao/externa",
    "/os/producao/pronto",
  ])("keeps the focused production route %s", route => {
    expect(app).toContain(`\"${route}\"`);
  });

  it("keeps only the two compact board destinations in the sidebar", () => {
    // A navegação utiliza objetos nomeados para manter a ordem operacional.
    // Validamos a presença de cada quadro, sem depender do formato antigo de arrays.
    expect(layout).toContain('href: "/os/arte", label: "Arte", Icon: Palette');
    expect(layout).toContain('href: "/os/producao", label: "Produção", Icon: Factory');
    expect(layout.match(/href: "\/os\/arte"/g)).toHaveLength(1);
    expect(layout.match(/href: "\/os\/producao"/g)).toHaveLength(1);
    expect(layout).toContain("active: operationalNav.art");
    expect(layout).toContain("active: operationalNav.production");
    expect(layout).not.toContain('"Aprovações"');
    expect(layout).not.toContain('"Quadro Geral"');
    expect(layout).not.toContain('"Produção Externa"');
  });
});
