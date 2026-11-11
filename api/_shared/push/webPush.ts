/**
 * RFC 8291 / RFC 8188 Web Push encryption + RFC 8292 VAPID, using Node
 * crypto only. No dynamic dependencies, no key generation on deployments.
 * The sending endpoint must be validated before calling fetch.
 */
import {
  createCipheriv, createECDH, createHash, createHmac,
  createPrivateKey, randomBytes, sign, timingSafeEqual,
} from "node:crypto";
import { validPushEndpoint } from "./subscriptions";

export type PushKind =
  | "assignment" | "art_inbox" | "production_released"
  | "installation_scheduled" | "installation_rescheduled";

export type PushJob = {
  job_id: string;
  kind: PushKind;
  order_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  attempt_number: number;
};

export type VapId = { subject: string; publicKey: string; privateKey: string };

const ORDER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS: readonly PushKind[] = [
  "assignment", "art_inbox", "production_released",
  "installation_scheduled", "installation_rescheduled",
];
const hmac = (key: Buffer, message: Buffer) =>
  createHmac("sha256", key).update(message).digest();

function fromBase64Url(value: string, size: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("push_key_invalid");
  const output = Buffer.from(value, "base64url");
  if (output.length !== size || output.toString("base64url") !== value)
    throw new Error("push_key_invalid");
  return output;
}

export function safePushJob(value: unknown): value is PushJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const job = value as Record<string, unknown>;
  if (typeof job.job_id !== "string" || !ORDER_UUID.test(job.job_id) ||
      typeof job.order_id !== "string" || !ORDER_UUID.test(job.order_id) ||
      !KINDS.includes(job.kind as PushKind) ||
      !validPushEndpoint(job.endpoint) ||
      typeof job.p256dh !== "string" || typeof job.auth_secret !== "string" ||
      !Number.isInteger(job.attempt_number) || (job.attempt_number as number) < 1 ||
      (job.attempt_number as number) > 10) return false;
  try {
    const receiver = fromBase64Url(job.p256dh, 65);
    const auth = fromBase64Url(job.auth_secret, 16);
    return receiver[0] === 4 && auth.length === 16;
  } catch { return false; }
}

export function validateVapid(value: VapId): boolean {
  if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.subject)) return false;
  try {
    const publicKey = fromBase64Url(value.publicKey, 65);
    const secret = fromBase64Url(value.privateKey, 32);
    if (publicKey[0] !== 4) return false;
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(secret);
    const match = pair.getPublicKey();
    return match.length === publicKey.length && timingSafeEqual(match, publicKey);
  } catch { return false; }
}

export function vapidJwt(endpoint: string, vapid: VapId, now = Date.now()): string {
  if (!validPushEndpoint(endpoint) || !validateVapid(vapid))
    throw new Error("vapid_invalid");
  const rawPublic = fromBase64Url(vapid.publicKey, 65);
  const privateD = fromBase64Url(vapid.privateKey, 32);
  const key = createPrivateKey({
    key: {
      kty: "EC", crv: "P-256",
      d: privateD.toString("base64url"),
      x: rawPublic.subarray(1,33).toString("base64url"),
      y: rawPublic.subarray(33,65).toString("base64url"),
    }, format: "jwk",
  });
  const jwtHeader = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now/1000) + 3600,
    sub: vapid.subject,
  })).toString("base64url");
  const signed = jwtHeader + "." + jwtPayload;
  const signature = sign("sha256", Buffer.from(signed), { key, dsaEncoding: "ieee-p1363" });
  return signed + "." + signature.toString("base64url");
}

export function encryptPushPayload(
  payload: { kind: PushKind; orderId: string },
  p256dh: string,
  authKey: string
): Buffer {
  if (!KINDS.includes(payload.kind) || !ORDER_UUID.test(payload.orderId))
    throw new Error("push_payload_invalid");
  const uaPublic = fromBase64Url(p256dh, 65);
  if (uaPublic[0] !== 4) throw new Error("push_key_invalid");
  const authSecret = fromBase64Url(authKey, 16);
  const ephemeral = createECDH("prime256v1");
  const serverPublic = ephemeral.generateKeys();
  const secret = ephemeral.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"), uaPublic, serverPublic,
  ]);
  const prk = hmac(authSecret, secret);
  const ikm = hmac(prk, Buffer.concat([keyInfo, Buffer.from([1])]));
  const salt = randomBytes(16);
  const material = hmac(salt, ikm);
  const cek = hmac(material, Buffer.from("Content-Encoding: aes128gcm\0\x01", "utf8")).subarray(0,16);
  const nonce = hmac(material, Buffer.from("Content-Encoding: nonce\0\x01", "utf8")).subarray(0,12);
  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(payload), "utf8"), Buffer.from([0x02]),
  ]);
  if (plaintext.length + 16 >= 3994) throw new Error("push_payload_too_large");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  // RFC8188 header: salt (16), rs (uint32 BE), idlen (1), keyid (65).
  // 4096 is greater than the single record length + tag.
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096,0);
  return Buffer.concat([salt, recordSize, Buffer.from([65]), serverPublic, ciphertext]);
}

export type PushSendResult = { status: number | null; outcome: "sent" | "retry" | "discarded" };

export async function sendWebPush(
  job: PushJob,
  vapid: VapId,
  fetcher: typeof fetch = fetch
): Promise<PushSendResult> {
  // Validate BEFORE making any network request (SSRF prevention).
  if (!safePushJob(job) || !validateVapid(vapid)) return { status: null, outcome: "discarded" };
  const endpoint = job.endpoint;
  try {
    const body = encryptPushPayload({ kind: job.kind, orderId: job.order_id },job.p256dh,job.auth_secret);
    const token = vapidJwt(endpoint,vapid);
    const topic = createHash("sha256").update(job.job_id).digest("base64url").slice(0,24);
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: "vapid t=" + token + ", k=" + vapid.publicKey,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600",
        Topic: topic,
        Urgency: "normal",
      },
      body: new Uint8Array(body),
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
    if (response.status >= 200 && response.status < 300)
      return { status: response.status, outcome: "sent" };
    if (response.status === 404 || response.status === 410)
      return { status: response.status, outcome: "discarded" };
    if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403)
      return { status: response.status, outcome: "retry" };
    return { status: response.status, outcome: "discarded" };
  } catch {
    // Never log endpoint, encryption keys, VAPID secret or raw provider body.
    return { status: null, outcome: "retry" };
  }
}
