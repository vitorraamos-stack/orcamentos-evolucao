import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const api=readFileSync("src/modules/hub-os/api.ts","utf8");
const client=readFileSync("src/modules/hub-os/pages/OsDetailPage.tsx","utf8");
const docs=readFileSync("docs/tasks/phase-19vc-frontend-defense.md","utf8");

describe("19V-C legacy OS client write-path defense (static)",()=>{
  it("removes deprecated direct payment_status updater",()=>{
    expect(api).not.toContain("export const updateOsPaymentStatus");
    expect(api).not.toContain(".update({ payment_status:");
  });
  it("prevents generic OS updates from passing sensitive fields",()=>{
    expect(api).toContain('Omit<Partial<Os>, "payment_status" | "quote_total" | "quote_id">');
    expect(api).toContain('Object.prototype.hasOwnProperty.call(payload, field)');
    expect(api).toContain('"Campos financeiros exigem fluxo de atualização autorizado."');
  });
  it("preserves the approved transactional payment RPC",()=>{
    expect(api).toContain('supabase.rpc("finalize_legacy_payment_submission"');
    expect(client).toContain("finalizeLegacyPaymentSubmission(proof.id)");
    expect(docs).toContain("not a substitute for 19V-C database restrictions");
  });
});
