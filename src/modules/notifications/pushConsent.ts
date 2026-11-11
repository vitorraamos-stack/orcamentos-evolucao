import { supabase } from "@/lib/supabase";

export type PushAvailability =
  | "supported"
  | "install_required"
  | "permission_denied"
  | "insecure"
  | "unsupported";

export interface PushPublicConfig {
  enabled: boolean;
  publicKey: string | null;
}

export class PushConsentError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function isAppleMobileDevice(userAgent: string, touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) ||
    (userAgent.includes("Macintosh") && touchPoints > 1);
}

export function getPushAvailability(options: {
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotifications: boolean;
  installed: boolean;
  appleMobile: boolean;
  permission: NotificationPermission | "unavailable";
}): PushAvailability {
  if (!options.secureContext) return "insecure";
  if (options.appleMobile && !options.installed) return "install_required";
  if (!options.hasServiceWorker || !options.hasPushManager || !options.hasNotifications)
    return "unsupported";
  if (options.permission === "denied") return "permission_denied";
  return "supported";
}

export function getBrowserPushAvailability(installed: boolean): PushAvailability {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  return getPushAvailability({
    secureContext: window.isSecureContext,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotifications: "Notification" in window,
    installed,
    appleMobile: isAppleMobileDevice(navigator.userAgent, navigator.maxTouchPoints),
    permission: "Notification" in window ? window.Notification.permission : "unavailable",
  });
}

export function parsePushPublicConfig(value: unknown): PushPublicConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.ok !== true || typeof obj.enabled !== "boolean") return null;
  if (!obj.enabled) return { enabled: false, publicKey: null };
  if (typeof obj.publicKey !== "string" || !/^[A-Za-z0-9_-]{86,88}$/.test(obj.publicKey))
    return null;
  return { enabled: true, publicKey: obj.publicKey };
}

export function decodeVapidPublicKey(raw: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{86,88}$/.test(raw)) throw new PushConsentError("invalid_public_key");
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4)
    throw new PushConsentError("invalid_public_key");
  return bytes;
}

async function requestJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    response = await fetch(path, {
      ...init,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    throw new PushConsentError("network_error");
  } finally {
    clearTimeout(timeout);
  }
  let json: unknown = null;
  try { json = await response.json(); }
  catch { throw new PushConsentError("unexpected_response"); }
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new PushConsentError("unexpected_response");
  const data = json as Record<string, unknown>;
  if (!response.ok || data.ok !== true)
    throw new PushConsentError(
      typeof data.code === "string" ? data.code : response.status === 401 ? "unauthorized" : "server_error"
    );
  return data;
}

export async function loadPushConfig(expectedUserId: string): Promise<PushPublicConfig> {
  const token = await pushAuthToken(expectedUserId);
  const raw = await requestJson("/api/push/config", {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
  });
  const config = parsePushPublicConfig(raw);
  if (!config) throw new PushConsentError("unexpected_response");
  return config;
}

export async function pushAuthToken(expectedUserId?: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || (expectedUserId && data.session.user.id !== expectedUserId))
    throw new PushConsentError("unauthorized");
  return data.session.access_token;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) return null;
  return registration.pushManager.getSubscription();
}

export async function registerBrowserPush(
  publicKey: string,
  token: string
): Promise<void> {
  const current = await navigator.serviceWorker.getRegistration();
  if (!current?.active) throw new PushConsentError("worker_unavailable");
  let subscription = await current.pushManager.getSubscription();
  let created = false;
  if (!subscription) {
    subscription = await current.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(publicKey),
    });
    created = true;
  }
  try {
    const json = subscription.toJSON();
    if (typeof json.endpoint !== "string" || !json.keys?.auth || !json.keys?.p256dh)
      throw new PushConsentError("invalid_subscription");
    await requestJson("/api/push/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        subscription: {
          endpoint: json.endpoint,
          keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
        },
      }),
    });
  } catch (error) {
    // Do not leave a new browser subscription after server rejects registration.
    if (created) {
      try { await subscription.unsubscribe(); } catch { /* Best effort. */ }
    }
    throw error;
  }
}

export async function isCurrentPushRegistered(token: string, endpoint: string): Promise<boolean> {
  const data = await requestJson("/api/push/status", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ endpoint }),
  });
  if (typeof data.registered !== "boolean") throw new PushConsentError("unexpected_response");
  return data.registered;
}

export async function revokeBrowserPush(token: string): Promise<{
  hadSubscription: boolean;
  serverRevoked: boolean;
}> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return { hadSubscription: false, serverRevoked: true };
  let serverRevoked = false;
  try {
    await requestJson("/api/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    serverRevoked = true;
  } catch {
    // Still detach browser endpoint so a shared device cannot receive later pushes.
  }
  let unsubscribed = false;
  try { unsubscribed = await subscription.unsubscribe(); }
  catch { /* Browser may have revoked it already. */ }
  if (!unsubscribed) throw new PushConsentError("browser_unsubscribe_failed");
  return { hadSubscription: true, serverRevoked };
}

/** Always remove the local endpoint during sign-out, even if backend is offline. */
export async function revokePushOnSignOut(token: string | null): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) return;
    if (token) {
      try {
        await requestJson("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } catch { /* Unsubscribe locally regardless. */ }
    }
    try { await subscription.unsubscribe(); }
    catch { /* Browser may have already removed it. */ }
  } catch { /* Sign out must remain possible when offline or unsupported. */ }
}
