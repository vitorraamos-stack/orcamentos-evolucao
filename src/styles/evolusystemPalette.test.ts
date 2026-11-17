import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const rootCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../components/evolusystem-shell.css", import.meta.url), "utf8");
const queueCss = readFileSync(new URL("../modules/my-queue/my-queue-content.css", import.meta.url), "utf8");
const ordersCss = readFileSync(new URL("../modules/orders/pages/orders-central.css", import.meta.url), "utf8");
const detailCss = readFileSync(new URL("../modules/orders/pages/order-detail-premium.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../modules/dashboard/operational-dashboard.css", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");
const reset = readFileSync(new URL("../pages/ResetPassword.tsx", import.meta.url), "utf8");

function contrastRatio(foreground: string, background: string) {
  function luminance(hex: string) {
    const rgb = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 :
      Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("EvoluSystem — identidade visual dark da Minha Fila", () => {
  it("centraliza a paleta oficial e mantém aparência dark-only", () => {
    const tokens = [
      "--evolu-page: #0B1219;",
      "--evolu-sidebar-bg: #111E29;",
      "--evolu-panel: #162631;",
      "--evolu-panel-raised: #1C2935;",
      "--evolu-field: #10212C;",
      "--evolu-border: #2B4555;",
      "--evolu-highlight: #65D1E9;",
      "--evolu-text: #EDF4FA;",
      "--evolu-text-muted: #9BB4C5;",
    ];
    for (const token of tokens) expect(rootCss).toContain(token);
    expect(rootCss).toContain(":root, .dark {");
    expect(rootCss).toContain("--color-card: var(--card)");
    expect(rootCss).toContain("@media print");
  });

  it("garante contraste legível para textos, destaques, botões e estados", () => {
    const pairs = [
      ["#EDF4FA", "#0B1219"], ["#EDF4FA", "#162631"],
      ["#9BB4C5", "#162631"], ["#65D1E9", "#0B1219"],
      ["#C9EDF8", "#254D62"], ["#FF8999", "#162631"],
      ["#6CD8B6", "#162631"], ["#F7BB70", "#162631"],
    ];
    for (const [foreground, background] of pairs)
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("usa os mesmos fundos na fila, shell e componentes compartilhados", () => {
    expect(queueCss).toContain("background: #0b1219;");
    expect(shellCss).toContain("background:var(--evolu-page)");
    expect(shellCss).toContain("background: var(--evolu-sidebar-bg)");
    expect(shellCss).not.toContain(".dark .evolu-shell__main :where(.bg-white");
    expect(ordersCss).toContain("var(--evolu-highlight)");
    expect(dashboardCss).toContain("var(--evolu-highlight)");
    expect(detailCss).toContain("--os-card: var(--evolu-panel)");
    expect(detailCss).toContain("--os-card-raised: var(--evolu-panel-raised)");
  });

  it("adapta login e recuperação sem modificar fluxos ou fundos de arte", () => {
    expect(login).toContain('bg-[#162631]');
    expect(reset).toContain('bg-[#162631]');
    expect(login).toContain("evolusystem-logo-dark.svg");
    expect(reset).toContain("evolusystem-logo-dark.svg");
    expect(login).toContain("onSubmit={handleSubmit}");
    expect(reset).toContain("onSubmit={changePassword}");
  });
});
