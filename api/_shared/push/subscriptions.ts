import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type PushEnv = NodeJS.ProcessEnv;

export type SubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type RegistrationCode = "registered" | "forbidden" | "endpoint_bound" | "device_limit" | "invalid";

export interface PushStore {
  getUser(token: string): Promise<string | null>;
  register(userId: string, endpointHash: string, data: SubscriptionPayload): Promise<RegistrationCode>;
  revoke(userId: string, endpointHash: string): Promise<boolean>;
}

const TRUSTED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);

export function isPushRegistrationEnabled(env: PushEnv): boolean {
  return env.PWA_PUSH_REGISTRATION_ENABLED === "true" &&
    typeof env.PWA_PUSH_VAPID_PUBLIC_KEY === "string" &&
    /^[A-Za-z0-9_-]{86,88}$/.test(env.PWA_PUSH_VAPID_PUBLIC_KEY) &&
    typeof env.PWA_PUSH_VAPID_PRIVATE_KEY === "string" &&
    /^[A-Za-z0-9_-]{42,44}$/.test(env.PWA_PUSH_VAPID_PRIVATE_KEY) &&
    typeof env.PWA_PUSH_VAPID_SUBJECT === "string" &&
    /^(mailto:)[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.PWA_PUSH_VAPID_SUBJECT);
}

function trustedPushHost(host: string): boolean {
  return TRUSTED_PUSH_HOSTS.has(host) ||
    host.endsWith(".push.apple.com") ||
    host === "wns.notify.windows.com" ||
    host.endsWith(".notify.windows.com");
}

export function validPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length < 32 || raw.length > 2048) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" ||
        url.username || url.password ||
        url.port || url.hash ||
        !trustedPushHost(url.hostname.toLowerCase()) ||
        url.pathname.length < 2) return false;
    // Normalize ambiguity away: don't silently accept equivalent URLs differing
    // by noncanonical spelling or trailing whitespace.
    return url.href === raw;
  } catch {
    return false;
  }
}

function validB64UrlKey(key: unknown, expectedBytes: number): key is string {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const decoded = Buffer.from(key.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (decoded.length !== expectedBytes) return false;
    if (expectedBytes === 65 && decoded[0] !== 4) return false;
    const roundtrip = decoded.toString("base64url");
    return roundtrip === key;
  } catch { return false; }
}

export function parseSubscription(value: unknown): SubscriptionPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!validPushEndpoint(data.endpoint)) return null;
  const keys = data.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const keyData = keys as Record<string, unknown>;
  if (!validB64UrlKey(keyData.p256dh, 65) || !validB64UrlKey(keyData.auth, 16)) return null;
  return {
    endpoint: data.endpoint,
    keys: { p256dh: keyData.p256dh, auth: keyData.auth },
  };
}

export function parseEndpointInput(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const endpoint = (value as Record<string, unknown>).endpoint;
  return validPushEndpoint(endpoint) ? endpoint : null;
}

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

export function parseJsonBody(raw: unknown, limitBytes = 4096): unknown {
  if (raw === null || raw === undefined) return null;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (Buffer.byteLength(text, "utf8") > limitBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function getBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9_\-.]{20,8192})$/.exec(header);
  return match ? match[1] : null;
}

/** Restricted server adapter; never put the service-role key in VITE_*. */
export function createPushStore(env: PushEnv): PushStore {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("push_db_configuration_missing");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async register(userId, endpointHash, subscription) {
      const { data, error } = await admin.rpc("push_v4_register_subscription", {
        p_user_id: userId,
        p_endpoint_hash: endpointHash,
        p_endpoint: subscription.endpoint,
        p_p256dh: subscription.keys.p256dh,
        p_auth_secret: subscription.keys.auth,
      });
      if (error) throw new Error("push_register_unavailable");
      const code = String(data);
      if (!["registered", "forbidden", "endpoint_bound", "device_limit", "invalid"].includes(code))
        throw new Error("push_register_unexpected");
      return code as RegistrationCode;
    },
    async revoke(userId, endpointHash) {
      const { data, error } = await admin.rpc("push_v4_revoke_subscription", {
        p_user_id: userId,
        p_endpoint_hash: endpointHash,
      });
      if (error) throw new Error("push_revoke_unavailable");
      return data === true;
    },
  };
}
