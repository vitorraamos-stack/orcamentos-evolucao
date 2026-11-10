import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Aparência escura obrigatória do EvoluSystem", () => {
  it("mantém o provedor global sem permitir seleção de tema", () => {
    const app = file("../App.tsx");
    expect(app).toContain("<ThemeProvider>");
    expect(app).not.toContain("defaultTheme");
    expect(app).not.toContain("switchable");
    const context = file("./ThemeContext.tsx");
    expect(context).toContain('resolvedTheme: "dark"');
    expect(context).toContain('classList.add("dark")');
  });
  it("não exibe o seletor de aparência nos menus desktop e móvel", () => {
    const layout = file("../components/Layout.tsx");
    expect(layout).not.toContain("ThemeSwitcher");
    expect(layout).toContain('className="evolu-shell__account');
  });
  it("inicia em escuro antes da renderização, sem consultar preferências antigas", () => {
    const html = file("../../index.html");
    expect(html).toContain('class="dark" style="color-scheme: dark;"');
    expect(html).not.toContain("evolusystem-theme");
    expect(html).not.toContain("prefers-color-scheme");
  });
  it("usa superfícies escuras no login e na recuperação da senha", () => {
    const login = file("../pages/Login.tsx");
    const reset = file("../pages/ResetPassword.tsx");
    const loginCss = file("../pages/login-layout.css");
    expect(login).toContain('bg-[#17283D]');
    expect(reset).toContain('bg-[#17283D]');
    expect(login).toContain('evolusystem-logo-dark.svg');
    expect(reset).toContain('evolusystem-logo-dark.svg');
    expect(loginCss).toContain("color-scheme: dark");
    expect(loginCss).not.toContain("color-scheme: light");
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
