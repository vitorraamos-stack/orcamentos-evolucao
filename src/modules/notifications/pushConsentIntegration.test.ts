import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const consent = read("src/modules/notifications/pushConsent.ts");
const view = read("src/components/notifications/PushNotificationPreferences.tsx");
const bell = read("src/components/notifications/NotificationBell.tsx");
const auth = read("src/contexts/AuthContext.tsx");
const api = read("api/push/status.ts");
const adapter = read("api/_shared/push/subscriptions.ts");
const vercel = JSON.parse(read("vercel.json")) as {
  git: { deploymentEnabled: Record<string, boolean> }; crons?: unknown[];
};

describe("PWA V4 Etapa 2D — integração segura sem envio", () => {
  it("exibe preferências na central existente sem nova rota ou bypass", () => {
    expect(bell).toContain("<PushNotificationPreferences userId={user!.id} />");
    expect(bell).toContain("canAccessOperationalSection");
    expect(view).toContain("usePwaExperience()");
    expect(view).toContain("install_required");
    expect(view).toContain("openInstallGuide");
  });

  it("nunca solicita permissão automaticamente", () => {
    expect(view).toContain("const activate = () =>");
    expect(view).toContain("Notification.requestPermission()");
    expect(view).toContain("disabled");
    expect(view).toContain('if (busy || !config?.enabled');
    expect(consent).not.toContain("Notification.requestPermission");
    expect(view).not.toContain("localStorage");
  });

  it("vincula somente o usuário autenticado e revoga durante logout", () => {
    expect(consent).toContain("supabase.auth.getSession()");
    expect(consent).toContain("expectedUserId");
    expect(consent).toContain("/api/push/subscriptions");
    expect(consent).toContain("/api/push/status");
    expect(consent).toContain("subscription.unsubscribe()");
    expect(auth).toContain("await revokePushOnSignOut(token)");
    expect(auth.indexOf("await revokePushOnSignOut(token)"))
      .toBeLessThan(auth.indexOf("await supabase.auth.signOut()"));
    expect(auth).toContain("void revokePushOnSignOut(null)");
  });

  it("consulta status por POST autenticado e sem endpoint nas URLs", () => {
    expect(api).toContain('req.method !== "POST"');
    expect(api).toContain("getBearer");
    expect(api).toContain("store.getUser(bearer)");
    expect(api).toContain("store.status(userId, hashPushEndpoint(endpoint))");
    expect(api).not.toContain("req.query");
    expect(adapter).toContain('admin.rpc("push_v4_subscription_status"');
  });

  it("não ativa envios, cron, migrations ou chaves no navegador", () => {
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-consent-ui-20261111"]).toBe(false);
    expect(vercel.crons).toEqual([{path:"/api/push/dispatch",schedule:"*/2 * * * *"}]);
    expect(consent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(view).not.toContain("VAPID_PRIVATE_KEY");
    expect(view).not.toContain("VITE_PUSH");
    expect(view).not.toContain("pushManager.subscribe({");
    expect(consent).not.toMatch(/\/api\/push\/dispatch/);
  });
});
