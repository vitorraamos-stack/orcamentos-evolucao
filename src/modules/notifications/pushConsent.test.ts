import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import {
  decodeVapidPublicKey,
  getPushAvailability,
  isAppleMobileDevice,
  parsePushPublicConfig,
  PushConsentError,
} from "./pushConsent";

const usable = {
  secureContext: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotifications: true,
  installed: true,
  appleMobile: false,
  permission: "default" as const,
};

describe("PWA V4 2D: consentimento explícito e disponibilidade", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("identifica necessidade de instalação no iOS e não tenta pedir permissão", () => {
    expect(isAppleMobileDevice("Mozilla/5.0 iPhone")).toBe(true);
    expect(isAppleMobileDevice("Macintosh", 5)).toBe(true);
    expect(isAppleMobileDevice("Android Mobile")).toBe(false);
    expect(getPushAvailability({ ...usable, appleMobile: true, installed: false })).toBe("install_required");
    expect(getPushAvailability({ ...usable, appleMobile: true, installed: true })).toBe("supported");
  });

  it("não oferece Push sem HTTPS, SW, PushManager, Notifications ou com bloqueio", () => {
    expect(getPushAvailability({ ...usable, secureContext: false })).toBe("insecure");
    expect(getPushAvailability({ ...usable, hasServiceWorker: false })).toBe("unsupported");
    expect(getPushAvailability({ ...usable, hasPushManager: false })).toBe("unsupported");
    expect(getPushAvailability({ ...usable, hasNotifications: false })).toBe("unsupported");
    expect(getPushAvailability({ ...usable, permission: "denied" })).toBe("permission_denied");
    expect(getPushAvailability({ ...usable, permission: "granted" })).toBe("supported");
  });

  it("aceita configuração apenas quando retorno de API está consistente", () => {
    expect(parsePushPublicConfig({ ok: true, enabled: false, publicKey: null }))
      .toEqual({ enabled: false, publicKey: null });
    expect(parsePushPublicConfig({ ok: true, enabled: false, publicKey: "private" }))
      .toEqual({ enabled: false, publicKey: null });
    const valid = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
    expect(parsePushPublicConfig({ ok: true, enabled: true, publicKey: valid }))
      .toEqual({ enabled: true, publicKey: valid });
    expect(parsePushPublicConfig({ ok: true, enabled: true, publicKey: "invalid" })).toBeNull();
    expect(parsePushPublicConfig({ ok: false, enabled: true, publicKey: valid })).toBeNull();
  });

  it("valida chave pública VAPID com 65 bytes e prefixo de curva EC", () => {
    const good = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString("base64url");
    expect(decodeVapidPublicKey(good)).toHaveLength(65);
    const malformed = Buffer.alloc(65, 0).toString("base64url");
    expect(() => decodeVapidPublicKey(malformed)).toThrow(PushConsentError);
    expect(() => decodeVapidPublicKey("not-a-key")).toThrow(PushConsentError);
  });
});
