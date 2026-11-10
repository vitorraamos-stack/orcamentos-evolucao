import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");

describe("EvoluSystem PWA v2", () => {
  it("mantém a atualização sujeita a aceite, sem cache de dados privados", () => {
    const sw = read("public/sw.js");
    const installing = sw.slice(sw.indexOf('self.addEventListener("install"'), sw.indexOf('self.addEventListener("activate"'));
    expect(installing).not.toContain("skipWaiting");
    expect(sw).toContain('event.data?.type === "SKIP_WAITING"');
    expect(sw).toContain('event.request.mode !== "navigate"');
    expect(sw).toContain('cache.addAll([OFFLINE_URL, "/evolusystem-icon.svg"])');
    expect(sw).not.toContain("cache.put(event.request");
    const experience = read("src/components/pwa/PwaExperience.tsx");
    expect(experience).toContain("waitingWorker.postMessage({ type: \"SKIP_WAITING\" })");
    expect(experience).toContain("if (updateRequested.current) window.location.reload()");
    expect(experience).toContain("Salve alterações em andamento");
  });

  it("atribui nova versão ao SW a cada deploy", () => {
    const sw = read("public/sw.js");
    const vite = read("vite.config.ts");
    expect(sw).toContain("__EVOLUSYSTEM_BUILD_ID__");
    expect(vite).toContain("versionedPwaWorker()");
    expect(vite).toContain("VERCEL_GIT_COMMIT_SHA");
    expect(vite).toContain("writeFileSync(swPath");
  });

  it("oferece instalação guiada no menu móvel e respeita áreas seguras", () => {
    const layout = read("src/components/Layout.tsx");
    const app = read("src/App.tsx");
    const css = read("src/components/evolusystem-shell.css");
    const html = read("index.html");
    expect(layout).toContain("Instalar aplicativo");
    expect(layout).toContain("openInstallGuide()");
    expect(app).toContain("<PwaExperienceProvider>");
    expect(html).toContain("viewport-fit=cover");
    expect(css).toContain("(display-mode: standalone)");
    expect(css).toContain("safe-area-inset-top");
    expect(css).toContain("safe-area-inset-bottom");
  });

  it("mantém o método manual no iOS e não força prompt nativo", () => {
    const experience = read("src/components/pwa/PwaExperience.tsx");
    expect(experience).toContain("Adicionar à Tela de Início");
    expect(experience).toContain("appleMobile ? (");
    expect(experience).toContain("!appleMobile && installPrompt");
  });
});
