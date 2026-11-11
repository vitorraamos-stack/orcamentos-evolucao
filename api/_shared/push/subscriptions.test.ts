import { describe, expect, it, vi } from "vitest";
import {
  getBearer, hashPushEndpoint, isPushRegistrationEnabled,
  parseEndpointInput, parseJsonBody, parseSubscription, validPushEndpoint,
  type PushEnv, type PushStore,
} from "./subscriptions";
import { handlePushSubscriptions } from "../../push/subscriptions";
import { handlePushPublicConfig } from "../../push/config";

const endpoint = "https://fcm.googleapis.com/fcm/send/abc12345678901234567890123";
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");
const authKey = Buffer.alloc(16, 4).toString("base64url");
const subscription = { endpoint, keys: { p256dh: publicKey, auth: authKey } };
const enabledEnv = {
  PWA_PUSH_REGISTRATION_ENABLED: "true",
  PWA_PUSH_VAPID_PUBLIC_KEY: "A".repeat(87),
  PWA_PUSH_VAPID_PRIVATE_KEY: "B".repeat(43),
  PWA_PUSH_VAPID_SUBJECT: "mailto:push@example.com",
} as PushEnv;

type FakeResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader: (name: string, value: string) => void;
  end: (value: string) => void;
};

const makeRes = (): FakeResponse => {
  const res: FakeResponse = {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
  return res;
};
const store = (): PushStore => ({
  getUser: vi.fn().mockResolvedValue("123e4567-e89b-42d3-a456-426614174111"),
  register: vi.fn().mockResolvedValue("registered"),
  revoke: vi.fn().mockResolvedValue(true),
});
const auth = { authorization: "Bearer " + "z".repeat(50) };

describe("Push V4: input validation and secrets", () => {
  it("accepts only well-formed encrypted subscriptions at trusted HTTPS push endpoints", () => {
    expect(parseSubscription(subscription)).toEqual(subscription);
    expect(validPushEndpoint(endpoint)).toBe(true);
    expect(validPushEndpoint("https://web.push.apple.com/ABCDEF12345")).toBe(true);
    expect(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/token")).toBe(true);
    expect(validPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(validPushEndpoint("https://localhost/push")).toBe(false);
    expect(validPushEndpoint("https://fcm.googleapis.com.evil.example/push")).toBe(false);
    expect(validPushEndpoint("https://fcm.googleapis.com:8443/push")).toBe(false);
    expect(validPushEndpoint("https://user:pass@fcm.googleapis.com/push")).toBe(false);
    expect(validPushEndpoint("https://127.0.0.1/push")).toBe(false);
    expect(parseSubscription({ ...subscription, keys: { ...subscription.keys, auth: "bad" } })).toBeNull();
    expect(parseSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: "A".repeat(87) } })).toBeNull();
  });

  it("hashes endpoint but never accepts bearer arrays, malformed tokens or oversized body", () => {
    expect(hashPushEndpoint(endpoint)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPushEndpoint(endpoint)).not.toContain(endpoint);
    expect(getBearer(auth.authorization)).toBe("z".repeat(50));
    expect(getBearer(["Bearer abc"])).toBeNull();
    expect(getBearer("Basic abc")).toBeNull();
    expect(parseJsonBody("x".repeat(5000))).toBeNull();
    expect(parseEndpointInput({ endpoint })).toBe(endpoint);
    expect(parseEndpointInput({ endpoint: "https://localhost/api" })).toBeNull();
  });

  it("stays disabled until feature flag and full VAPID configuration exist", () => {
    expect(isPushRegistrationEnabled({})).toBe(false);
    expect(isPushRegistrationEnabled({ PWA_PUSH_REGISTRATION_ENABLED: "true" })).toBe(false);
    expect(isPushRegistrationEnabled(enabledEnv)).toBe(true);
    expect(isPushRegistrationEnabled({ ...enabledEnv, PWA_PUSH_VAPID_PRIVATE_KEY: undefined })).toBe(false);
  });
});

describe("Push V4: server API", () => {
  it("returns 503 and never registers while feature flag is disabled", async () => {
    const data = store(), res = makeRes();
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription } }, res, { env: {}, store: data });
    expect(res.statusCode).toBe(503);
    expect(data.getUser).not.toHaveBeenCalled();
  });

  it("rejects incorrect methods, unauthenticated and malformed requests", async () => {
    const data = store();
    const a = makeRes();
    await handlePushSubscriptions({ method: "GET" }, a, { env: enabledEnv, store: data });
    expect(a.statusCode).toBe(405);
    const b = makeRes();
    await handlePushSubscriptions({ method: "POST", body: { subscription } }, b, { env: enabledEnv, store: data });
    expect(b.statusCode).toBe(401);
    const c = makeRes();
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription: { ...subscription, endpoint: "https://evil.example/steal", } } }, c, { env: enabledEnv, store: data });
    expect(c.statusCode).toBe(400);
    expect(data.getUser).not.toHaveBeenCalled();
  });

  it("uses verified auth user and hash, without returning secrets", async () => {
    const data = store(), res = makeRes();
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription, userId: "forged" } }, res, { env: enabledEnv, store: data });
    expect(res.statusCode).toBe(200);
    expect(data.getUser).toHaveBeenCalledWith("z".repeat(50));
    expect(data.register).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174111", hashPushEndpoint(endpoint), subscription);
    expect(JSON.stringify(res.body)).not.toContain("p256dh");
    expect(JSON.stringify(res.body)).not.toContain(endpoint);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("denies a valid token when auth provider rejects it", async () => {
    const data = store(), res = makeRes();
    vi.mocked(data.getUser).mockResolvedValueOnce(null);
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription } }, res, { env: enabledEnv, store: data });
    expect(res.statusCode).toBe(401);
    expect(data.register).not.toHaveBeenCalled();
  });

  it("denies a device already linked to another account and module revocation", async () => {
    const data = store();
    vi.mocked(data.register).mockResolvedValueOnce("endpoint_bound");
    const res = makeRes();
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription } }, res, { env: enabledEnv, store: data });
    expect(res.statusCode).toBe(409);

    vi.mocked(data.register).mockResolvedValueOnce("forbidden");
    const other = makeRes();
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription } }, other, { env: enabledEnv, store: data });
    expect(other.statusCode).toBe(403);
  });

  it("allows revocation even if registration is disabled, and masks ownership", async () => {
    const data = store(), res = makeRes();
    await handlePushSubscriptions({ method: "DELETE", headers: auth, body: { endpoint } }, res, { env: {}, store: data });
    expect(res.statusCode).toBe(200);
    expect(data.revoke).toHaveBeenCalledWith("123e4567-e89b-42d3-a456-426614174111", hashPushEndpoint(endpoint));
    expect(res.body).toEqual({ ok: true, registered: false });
  });

  it("fails closed when database adapter throws", async () => {
    const data = store(), res = makeRes();
    vi.mocked(data.register).mockRejectedValueOnce(new Error("secret data"));
    await handlePushSubscriptions({ method: "POST", headers: auth, body: { subscription } }, res, { env: enabledEnv, store: data });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("secret data");
  });

  it("public config exposes only the public VAPID key when enabled", () => {
    const disabled = makeRes();
    handlePushPublicConfig({ method: "GET" }, disabled, {});
    expect(disabled.body).toEqual({ ok: true, enabled: false, publicKey: null });
    const ready = makeRes();
    handlePushPublicConfig({ method: "GET" }, ready, enabledEnv);
    expect(ready.body).toEqual({ ok: true, enabled: true, publicKey: "A".repeat(87) });
    expect(JSON.stringify(ready.body)).not.toContain("B".repeat(43));
  });
});
