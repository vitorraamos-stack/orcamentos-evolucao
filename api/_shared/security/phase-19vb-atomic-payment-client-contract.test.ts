import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ui = readFileSync("src/modules/hub-os/pages/OsDetailPage.tsx", "utf8");
const api = readFileSync("src/modules/hub-os/api.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql",
  "utf8"
);
const handler = ui.slice(
  ui.indexOf("const handlePaymentSubmit = async () => {"),
  ui.indexOf("\n  if (loading) {")
);

describe("19V-B: legacy payment flow uses already-installed atomic RPC", () => {
  it("preserves DB/R2 workflow until first attachment metadata is saved", () => {
    expect(handler.indexOf("createPaymentProof({")).toBeGreaterThan(0);
    expect(handler.indexOf("updatePaymentProof(proof.id, {")).toBeGreaterThan(
      handler.indexOf('stage = "r2_upload_started"')
    );
    expect(handler.indexOf("finalizeLegacyPaymentSubmission(proof.id)")).toBeGreaterThan(
      handler.indexOf("updatePaymentProof(proof.id, {")
    );
    expect(migration).toContain("finalize_legacy_payment_submission(p_proof_id uuid)");
  });

  it("never separately writes financial status or a submitted event", () => {
    expect(handler).not.toContain("payment_status: nextStatus");
    expect(handler).not.toContain("resolvePaymentStatus(");
    expect(handler).not.toContain('type: "PAYMENT_SUBMITTED"');
    expect(handler).not.toContain('stage = "status_update_started"');
    expect(handler).toContain('stage = "finalization_started"');
    expect(api).toContain('.rpc("finalize_legacy_payment_submission", {');
    expect(api).toContain("p_proof_id: proofId");
    expect(api).toContain("parseLegacyPaymentFinalization(data, proofId)");
  });

  it("refreshes persisted state after RPC success and reconciles uncertain responses read-only", () => {
    expect(handler).toContain("finalization.already_submitted");
    expect(handler).toContain("finalization.current_os_payment_status");
    expect(handler).toContain("fetchOsById(order.id)");
    expect(handler).toContain("fetchOsEvents(order.id)");
    expect(handler).toContain("fetchOsPayments(order.id)");
    expect(handler).toContain("hasOwnSubmittedPaymentEvent(freshEvents, createdProof.id, user.id)");
    expect(handler).toContain("return;");
    expect(handler).toContain("setPaymentSubmissionNeedsReview(true)");
    expect(handler).toContain("paymentSubmissionInFlight.current = false");
    expect(ui).toContain('role="alert"');
  });
});
