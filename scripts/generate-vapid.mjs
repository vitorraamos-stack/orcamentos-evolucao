#!/usr/bin/env node
// Generates one permanent VAPID P-256 keypair for manual entry in Vercel.
// NEVER commit the output, paste it into chat, or generate a new pair per deploy.
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey().toString("base64url");
const privateKey = ecdh.getPrivateKey().toString("base64url");
if (publicKey.length !== 87 || privateKey.length !== 43) {
  throw new Error("Unexpected VAPID key length");
}

process.stdout.write(
  "VAPID keypair (copy directly into Vercel Production env settings):\n" +
  "PWA_PUSH_VAPID_PUBLIC_KEY=" + publicKey + "\n" +
  "PWA_PUSH_VAPID_PRIVATE_KEY=" + privateKey + "\n\n" +
  "Set PWA_PUSH_VAPID_SUBJECT=mailto:<an existing company email>.\n" +
  "Never paste these keys into GitHub, tickets, chat or CI logs.\n" +
  "Preserve the pair across deployments; rotating it invalidates prior subscriptions.\n"
);
