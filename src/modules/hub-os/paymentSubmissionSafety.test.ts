import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getPaymentRecoveryPlan,
  preparePaymentFile,
} from "./paymentSubmissionSafety";

const file = (name: string, size: number, type = "") =>
  ({ name, size, type }) as File;

describe("19U: legacy payment client safeguards (synthetic, no network)", () => {
  it("validates files locally before a financial database insert", () => {
    expect(preparePaymentFile(null)).toBeNull();
    expect(preparePaymentFile(file("recibo.pdf", 500, "application/pdf"))).toEqual({
      contentType: "application/pdf",
      sizeBytes: 500,
      sanitizedName: "recibo.pdf",
    });
    expect(() => preparePaymentFile(file("vazio.pdf", 0, "application/pdf"))).toThrow("não vazio");
    expect(() => preparePaymentFile(file("invalido.exe", 200))).toThrow("Tipo de arquivo");
    expect(() => preparePaymentFile(file("excessivo.pdf", 500 * 1024 * 1024 + 1, "application/pdf"))).toThrow("500MB");
  });

  it.each([
    ["preflight", true, false, false],
    ["proof_create_started", false, false, true],
    ["proof_created", true, true, false],
    ["proof_created", false, false, true],
    ["r2_upload_started", true, false, true],
    ["r2_uploaded", true, false, true],
    ["metadata_saved", true, false, true],
    ["status_update_started", false, false, true],
    ["status_updated", false, false, true],
    ["event_insert_started", true, false, true],
  ] as const)(
    "%s file=%s -> cleanup=%s review=%s",
    (stage, selected, safeToDeletePendingProof, manualReviewRequired) => {
      expect(getPaymentRecoveryPlan(stage, selected)).toEqual({
        safeToDeletePendingProof,
        manualReviewRequired,
      });
    }
  );

  it("keeps synchronous single-flight, preflight, and visible reconciliation block", () => {
    const ui = readFileSync("src/modules/hub-os/pages/OsDetailPage.tsx", "utf8");
    const handler = ui.slice(
      ui.indexOf("const handlePaymentSubmit = async () => {"),
      ui.indexOf("\n  if (loading) {")
    );
    expect(handler).toContain("paymentSubmissionInFlight.current) return");
    expect(handler).toContain("paymentSubmissionInFlight.current = true");
    expect(handler).toContain("paymentSubmissionInFlight.current = false");
    expect(handler.indexOf("preparePaymentFile(paymentFile)"))
      .toBeLessThan(handler.indexOf("createPaymentProof({"));
    expect(handler).toContain('stage = "r2_upload_started"');
    expect(handler).toContain('stage = "status_update_started"');
    expect(handler).toContain('stage = "event_insert_started"');
    expect(handler).toContain("setPaymentSubmissionNeedsReview(true)");
    expect(ui).toContain('role="alert"');
    expect(ui).toContain("disabled={saving || paymentSubmissionNeedsReview}");
  });

  it("does not remove the established R2 + payment event contract", () => {
    const ui = readFileSync("src/modules/hub-os/pages/OsDetailPage.tsx", "utf8");
    expect(ui).toContain("updatePaymentProof(proof.id, {");
    expect(ui).toContain('type: "PAYMENT_SUBMITTED"');
    expect(ui).toContain("payload: { payment_id: proof.id, status: nextStatus }");
  });
});
