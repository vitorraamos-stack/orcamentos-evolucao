import { describe, expect, it } from "vitest";
import { hasOwnSubmittedPaymentEvent, parseLegacyPaymentFinalization } from "./paymentFinalization";

const proof = "11111111-2222-4333-8444-555555555555";
const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("19V-B: transactional payment RPC response (synthetic)", () => {
  it("accepts a new submission using authoritative server status", () => {
    expect(parseLegacyPaymentFinalization({
      payment_id: proof,
      payment_status: "RELEASED",
      current_os_payment_status: "RELEASED",
      already_submitted: false,
    }, proof)).toEqual({
      payment_id: proof,
      payment_status: "RELEASED",
      current_os_payment_status: "RELEASED",
      already_submitted: false,
    });
  });

  it("preserves current OS status on an idempotent retry after later payments", () => {
    const response = parseLegacyPaymentFinalization({
      payment_id: proof,
      payment_status: "SCHEDULED",
      current_os_payment_status: "UNDER_REVIEW",
      already_submitted: true,
    }, proof);
    expect(response.already_submitted).toBe(true);
    expect(response.current_os_payment_status).toBe("UNDER_REVIEW");
  });

  it.each([
    null,
    [],
    { payment_id: "another", payment_status: "RELEASED", current_os_payment_status: "RELEASED", already_submitted: false },
    { payment_id: proof, payment_status: "RELEASED", current_os_payment_status: "BLOCKED", already_submitted: "false" },
    { payment_id: proof, payment_status: "NONSENSE", current_os_payment_status: "RELEASED", already_submitted: false },
    { payment_id: proof, payment_status: "RELEASED", current_os_payment_status: null, already_submitted: false },
  ])("rejects an incomplete or contradictory response (%j)", (input) => {
    expect(() => parseLegacyPaymentFinalization(input, proof)).toThrow();
  });

  it("recognizes persisted evidence only for that proof and actor", () => {
    const own = { type: "PAYMENT_SUBMITTED", created_by: owner, payload: { payment_id: proof, status: "RELEASED" } };
    expect(hasOwnSubmittedPaymentEvent([own], proof, owner)).toBe(true);
    expect(hasOwnSubmittedPaymentEvent([own], "another", owner)).toBe(false);
    expect(hasOwnSubmittedPaymentEvent([own], proof, "someone-else")).toBe(false);
    expect(hasOwnSubmittedPaymentEvent([own], proof, null)).toBe(false);
    expect(hasOwnSubmittedPaymentEvent([{ ...own, type: "STATUS_CHANGED" }], proof, owner)).toBe(false);
  });
});
