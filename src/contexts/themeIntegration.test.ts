import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Seletor de aparência do EvoluSystem", () => {
  it("ativa o controle apenas dentro do provedor da aplicação", () => {
    const app = file("../App.tsx");
    expect(app).toContain('<ThemeProvider defaultTheme="light" switchable>');
  });
  it("mostra o seletor nos menus desktop e móvel, sem nova tela ou permissão", () => {
    const layout = file("../components/Layout.tsx");
    expect(layout.match(/<ThemeSwitcher \/>/g)).toHaveLength(2);
    expect(layout).toContain('className="evolu-shell__account');
  });
  it("garante o tema salvo antes da primeira renderização", () => {
    const html = file("../../index.html");
    expect(html).toContain('localStorage.getItem("evolusystem-theme")');
    expect(html).toContain('document.documentElement.classList.toggle("dark", dark)');
  });

  it("mantém fundos de artes e prévias intactos, sem override global", () => {
    const css = file("../components/evolusystem-shell.css");
    expect(css).not.toContain(".dark .evolu-shell__main :where(.bg-white");
    expect(css).toContain(".dark .evolu-shell__main");
  });
  it("adapta os controles e a linha do tempo dos detalhes da OS ao tema escuro", () => {
    const css = file("../modules/orders/pages/order-detail-premium.css");
    for (const selector of [
      ".dark .evolu-detail__transition-button",
      ".dark .evolu-detail__stage-bubble--pending",
      ".dark .evolu-detail__quick-info-icon",
      ".dark .evolu-detail__tab:hover",
    ]) {
      expect(css).toContain(selector);
    }
  });
  it("aproveita estilos escuros já existentes em dashboard e ordens", () => {
    expect(file("../modules/dashboard/operational-dashboard.css")).toContain(".dark .evolu-dashboard");
    expect(file("../modules/orders/pages/orders-central.css")).toContain(".dark .evolu-orders");
  });
  it("mantém notificações sincronizadas com o tema principal", () => {
    expect(file("../components/ui/sonner.tsx")).toContain('theme={resolvedTheme as ToasterProps["theme"]}');
  });
});
