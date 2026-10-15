import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync(
  "supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql",
  "utf8"
);
const candidate=readFileSync(
  "docs/tasks/phase-19va-migration-CANDIDATE.sql",
  "utf8"
);
const instructions=readFileSync(
  "docs/tasks/phase-19va-migration-review.md",
  "utf8"
);

describe("19V-A: recorded production migration is in GitHub history", () => {
  it("records the exact Supabase-generated version and source", () => {
    expect(instructions).toContain("20261015134750_phase_19va_atomic_payment_finalization");
    expect(instructions).toContain("Supabase CLI was");
    expect(migration).toContain("recorded version 20261015134750");
    expect(migration).toContain("finalize_legacy_payment_submission");
  });
  it("changes only documentation comments from the reviewed SQL", () => {
    const withoutHeader=(s: string) => s.slice(s.indexOf("-- The new RPC and partial index"));
    expect(withoutHeader(migration)).toBe(withoutHeader(candidate));
    expect(migration).toContain("19VA_POSTCHECK_FAILED");
    expect(migration).toContain("19VA_ABORT_19T_DRIFT");
  });
  it("preserves additive scope", () => {
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("CREATE UNIQUE INDEX os_event_payment_submission_once");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.finalize_legacy_payment_submission(uuid)");
    expect(instructions).toContain("not been used by the frontend");
  });
});
