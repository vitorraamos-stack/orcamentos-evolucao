import { describe, expect, it } from "vitest";
import { getVerifiedOrientation } from "./orientation";
const base = { loaded: true, error: null, userId: "u1", productionStatus: null };
describe("verified order orientation", () => {
  it("never invents a task before verified data loads", () => {
    expect(getVerifiedOrientation({ ...base, loaded: false, operations: [{ id: "x", status: "PENDING", is_required: true }] }).kind).toBe("neutral");
  });
  it("prioritizes a genuine required blocker", () => {
    expect(getVerifiedOrientation({ ...base, operations: [{ id: "b", status: "BLOCKED", is_required: true, blocked_reason: "Falta material" }] }))
      .toEqual({ kind: "blocked", recordId: "b", reason: "Falta material" });
  });
  it("prioritizes work assigned to the current user", () => {
    expect(getVerifiedOrientation({ ...base, operations: [
      { id: "other", status: "PENDING", is_required: true, assigned_to: "u2" },
      { id: "mine", status: "IN_PROGRESS", is_required: true, assigned_to: "u1" },
    ] })).toMatchObject({ kind: "next", recordId: "mine", own: true });
  });
  it("does not interpret archived as finished", () => {
    expect(getVerifiedOrientation({ ...base, productionStatus: "Produção", operations: [] }).kind).toBe("neutral");
  });
});
