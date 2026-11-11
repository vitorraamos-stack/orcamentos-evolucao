import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("PWA V4 — integração sem alteração de schema", () => {
  it("mantém o controle por módulos e a consulta somente de leitura", () => {
    const provider = read("src/components/notifications/OperationalNotificationsProvider.tsx");
    const repository = read("src/modules/notifications/notificationsRepository.ts");
    expect(provider).toContain('canAccessOperationalSection(access, "art")');
    expect(provider).toContain('canAccessOperationalSection(access, "production")');
    expect(provider).toContain('canAccessOperationalSection(access, "installations")');
    expect(repository).toContain('.from("os_orders_event")');
    expect(repository).toContain('.eq("archived", false)');
    expect(repository).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(|\.update\(/);
    expect(provider).toContain('table: "os_installations"');
  });

  it("integra a central no layout sem abrir acesso em rotas", () => {
    const layout = read("src/components/Layout.tsx");
    const app = read("src/App.tsx");
    expect(layout).toContain("<NotificationBell");
    expect(layout).toContain("evolu-shell__mobile-nav");
    expect(app).toContain("<OperationalNotificationsProvider>");
  });

  it("prepara os eventos push sem emitir mensagens ou criar inscrições", () => {
    const worker = read("public/sw.js");
    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain('self.addEventListener("notificationclick"');
    expect(worker).toContain('SAFE_ORDER_ID.test(id)');
    expect(worker).toContain('self.registration.showNotification("EvoluSystem"');
    expect(worker).toContain('event.request.mode !== "navigate"');
    expect(worker).not.toContain("cache.put(event.request");
    expect(worker).not.toContain("subscribe({");
  });

  it("não inclui migrations, segredos ou chaves VAPID no aplicativo", () => {
    const doc = read("docs/pwa.md");
    const worker = read("public/sw.js");
    expect(doc).toContain("PWA v4 — Etapa 1");
    expect(worker).not.toContain("VAPID_PRIVATE_KEY");
    expect(worker).not.toContain("service_role");
  });
});
