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
  it("mantém notificações sincronizadas com o tema principal", () => {
    expect(file("../components/ui/sonner.tsx")).toContain('theme={resolvedTheme as ToasterProps["theme"]}');
  });
});
