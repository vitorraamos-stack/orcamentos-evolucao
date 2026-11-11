import {
  createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify,
} from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  encryptPushPayload, safePushJob, sendWebPush, validateVapid, vapidJwt,
  type PushJob, type VapId,
} from "./webPush";

const hmac=(k:Buffer,m:Buffer)=>createHmac("sha256",k).update(m).digest();
const endpoint="https://fcm.googleapis.com/fcm/send/"+"a".repeat(28);
const receiver=createECDH("prime256v1");
receiver.generateKeys();
const auth=randomBytes(16);
const senderIdentity=createECDH("prime256v1");
senderIdentity.generateKeys();
const vapid: VapId={
  subject:"mailto:push@example.com",
  publicKey:senderIdentity.getPublicKey().toString("base64url"),
  privateKey:senderIdentity.getPrivateKey().toString("base64url"),
};
const job:PushJob={
  job_id:"123e4567-e89b-42d3-a456-426614174001",
  order_id:"123e4567-e89b-42d3-a456-426614174002",
  kind:"assignment",
  endpoint,
  p256dh:receiver.getPublicKey().toString("base64url"),
  auth_secret:auth.toString("base64url"),
  attempt_number:1,
};
function decryptRfc8291(input:Buffer):string{
  const salt=input.subarray(0,16);
  expect(input.readUInt32BE(16)).toBe(4096);
  const keyLength=input[20];
  expect(keyLength).toBe(65);
  const senderPublic=input.subarray(21,21+keyLength);
  const encrypted=input.subarray(21+keyLength);
  const shared=receiver.computeSecret(senderPublic);
  const ikm=hmac(hmac(auth,shared),Buffer.concat([
    Buffer.from("WebPush: info\0"),receiver.getPublicKey(),senderPublic,
    Buffer.from([1]),
  ]));
  const material=hmac(salt,ikm);
  const cek=hmac(material,Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0,16);
  const nonce=hmac(material,Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0,12);
  const decipher=createDecipheriv("aes-128-gcm",cek,nonce);
  decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
  const plaintext=Buffer.concat([
    decipher.update(encrypted.subarray(0,encrypted.length-16)),decipher.final(),
  ]);
  expect(plaintext[plaintext.length-1]).toBe(0x02);
  return plaintext.subarray(0,-1).toString("utf8");
}

describe("PWA V4 — Web Push RFC8291 + VAPID",()=>{
  it("validates matching ES256 public/private VAPID keys",()=>{
    expect(validateVapid(vapid)).toBe(true);
    expect(validateVapid({...vapid,subject:"https://localhost"})).toBe(false);
    expect(validateVapid({...vapid,privateKey:randomBytes(32).toString("base64url")})).toBe(false);
  });

  it("signs an ES256 JWT scoped only to the Push origin",()=>{
    const jwt=vapidJwt(endpoint,vapid,Date.UTC(2026,10,11,12));
    const [header,payload,signature]=jwt.split(".");
    expect(JSON.parse(Buffer.from(header,"base64url").toString())).toEqual({typ:"JWT",alg:"ES256"});
    const decoded=JSON.parse(Buffer.from(payload,"base64url").toString());
    expect(decoded).toMatchObject({
      aud:"https://fcm.googleapis.com",sub:vapid.subject,
      exp:Math.floor(Date.UTC(2026,10,11,12)/1000)+3600,
    });
    const raw=Buffer.from(vapid.publicKey,"base64url");
    const pub=createPublicKey({
      key:{kty:"EC",crv:"P-256",x:raw.subarray(1,33).toString("base64url"),y:raw.subarray(33).toString("base64url")},
      format:"jwk",
    });
    expect(verify("sha256",Buffer.from(header+"."+payload),{key:pub,dsaEncoding:"ieee-p1363"},Buffer.from(signature,"base64url"))).toBe(true);
  });

  it("encrypts AES128GCM with a new ephemeral key and salt; user-agent decrypts it",()=>{
    const data={kind:"assignment" as const,orderId:job.order_id};
    const first=encryptPushPayload(data,job.p256dh,job.auth_secret);
    const second=encryptPushPayload(data,job.p256dh,job.auth_secret);
    expect(first.equals(second)).toBe(false);
    expect(first.toString("utf8")).not.toContain("orderId");
    expect(JSON.parse(decryptRfc8291(first))).toEqual(data);
    expect(JSON.parse(decryptRfc8291(second))).toEqual(data);
    expect(first.length).toBeLessThan(4096);
  });

  it("rejects non-allowlisted provider endpoints and malformed subscription keys",()=>{
    expect(safePushJob(job)).toBe(true);
    expect(safePushJob({...job,endpoint:"http://localhost/secret"})).toBe(false);
    expect(safePushJob({...job,endpoint:"https://fcm.googleapis.com.evil.test/send"})).toBe(false);
    expect(safePushJob({...job,auth_secret:"short"})).toBe(false);
    expect(()=>encryptPushPayload({kind:"assignment",orderId:"../../x"},job.p256dh,job.auth_secret)).toThrow();
  });

  it("calls only trusted HTTPS endpoint, encrypts body and classifies response",async()=>{
    const fetched=vi.fn().mockResolvedValue({status:201});
    const ok=await sendWebPush(job,vapid,fetched as unknown as typeof fetch);
    expect(ok).toEqual({status:201,outcome:"sent"});
    expect(fetched).toHaveBeenCalledTimes(1);
    const [url,params]=fetched.mock.calls[0] as [string,RequestInit];
    expect(url).toBe(endpoint);
    expect(params.redirect).toBe("error");
    expect(JSON.stringify(params.headers)).toContain("aes128gcm");
    expect(decryptRfc8291(Buffer.from(params.body as Uint8Array))).toContain(job.order_id);

    fetched.mockResolvedValueOnce({status:410});
    expect((await sendWebPush(job,vapid,fetched as unknown as typeof fetch)).outcome).toBe("discarded");
    fetched.mockResolvedValueOnce({status:429});
    expect((await sendWebPush(job,vapid,fetched as unknown as typeof fetch)).outcome).toBe("retry");
    fetched.mockRejectedValueOnce(new Error("secret endpoint"));
    expect((await sendWebPush(job,vapid,fetched as unknown as typeof fetch)).outcome).toBe("retry");

    fetched.mockClear();
    expect(await sendWebPush({...job,endpoint:"https://untrusted.example/push"},vapid,fetched as unknown as typeof fetch))
      .toEqual({status:null,outcome:"discarded"});
    expect(fetched).not.toHaveBeenCalled();
  });
});
