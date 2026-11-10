import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("PWA v3 mobile navigation integration", () => {
  it("reuses existing module access decisions and preserves all existing menu options", () => {
    const layout = read("src/components/Layout.tsx");
    expect(layout).toContain("getMobileShortcuts({");
    expect(layout).toContain("orders: canViewHubOs");
    expect(layout).toContain("art: canViewArteBoard");
    expect(layout).toContain("production: canViewProducaoBoard");
    expect(layout).toContain("installations: canViewInstallations");
    expect(layout).toContain("<NavItems />");
    expect(layout).toContain("setMobileOpen(true)");
    expect(layout).toContain("aria-label=\"Atalhos do EvoluSystem\"");
  });

  it("provides safe-area spacing without affecting desktop sidebar and hides dock during text editing", () => {
    const css = read("src/components/evolusystem-shell.css");
    expect(css).toContain(".evolu-shell__mobile-nav");
    expect(css).toContain("safe-area-inset-bottom");
    expect(css).toContain("min-height: 52px");
    expect(css).toContain(":has(input:focus");
    expect(css).toContain("@media (min-width: 768px)");
  });

  it("shows an online-only connection status without caching orders", () => {
    const layout = read("src/components/Layout.tsx");
    expect(layout).toContain("navigator.onLine");
    expect(layout).toContain('window.addEventListener("offline"');
    expect(layout).toContain("Sem conexão");
    const worker = read("public/sw.js");
    expect(worker).toContain('event.request.mode !== "navigate"');
    expect(worker).not.toContain("cache.put(event.request");
  });
});
