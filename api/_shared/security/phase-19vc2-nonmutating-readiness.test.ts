import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const audit = readFileSync(
  "docs/tasks/phase-19vc2-nonmutating-production-gates.sql", "utf8"
);
const doc = readFileSync(
  "docs/tasks/phase-19vc2-nonmutating-readiness-review.md", "utf8"
);
const candidate = readFileSync(
  "docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql", "utf8"
);
const historical = readFileSync(
  "supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql", "utf8"
);

describe("19V-C2 non-mutating readiness evidence (not transactional tests)", () => {
  it("allows SELECT-only checks and expressly refuses to certify C2", () => {
    const executable = audit.replace(/^--.*$/gm, "");
    expect(executable.trimStart().startsWith("WITH flags AS")).toBe(true);
    expect(executable).not.toMatch(
      /(?:^|\n)\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|REVOKE|GRANT|DO|SET|CALL|BEGIN|COMMIT|ROLLBACK)\b/im
    );
    expect(audit).toContain("FALSE AS c2_transactions_homologated");
    expect(audit).toContain("FALSE AS c2_concurrency_homologated");
    expect(audit).toContain("FALSE AS real_authenticated_jwt_homologated");
  });

  it("checks applied guards, the true index, lock ordering and idempotency path", () => {
    expect(audit).toContain("os_event_payment_submission_once");
    expect(historical).toContain("CREATE UNIQUE INDEX os_event_payment_submission_once");
    expect(candidate).toContain("SECURITY DEFINER");
    const helper = candidate.slice(candidate.indexOf(
      "CREATE FUNCTION evolusystem_finance_private.finalize_legacy_payment_submission"
    ));
    const osLock = helper.indexOf("FROM public.os o\n  WHERE o.id=v_os_id\n  FOR UPDATE;");
    const proofLock = helper.indexOf("FROM public.os_payment_proof p\n  WHERE p.id=p_proof_id AND p.os_id=v_order.id AND p.created_by=v_actor\n  FOR UPDATE;");
    const eventQuery = helper.indexOf("FROM public.os_event e\n  WHERE e.os_id=v_order.id AND e.type='PAYMENT_SUBMITTED'");
    const update = helper.indexOf("UPDATE public.os o");
    const insert = helper.indexOf("INSERT INTO public.os_event(os_id,type,payload,created_by)");
    expect(osLock).toBeGreaterThan(-1);
    expect(proofLock).toBeGreaterThan(osLock);
    expect(eventQuery).toBeGreaterThan(proofLock);
    expect(update).toBeGreaterThan(eventQuery);
    expect(insert).toBeGreaterThan(update);
    expect(helper).toContain("'already_submitted',true");
    expect(helper).toContain("p.created_by=v_actor");
    expect(candidate).toContain("REVOKE MAINTAIN ON public.os,public.os_event,public.os_payment_proof");
  });

  it("documents the remaining gates without disguising mock checks as production", () => {
    expect(doc).toContain("Nenhuma OS, evento ou comprovante legados existiam");
    expect(doc).toContain("sessão JWT não testada");
    expect(doc).toContain("não são seguros");
    expect(doc).toContain("sem ambiente de teste");
    expect(doc).toContain("Não executar a 19V-C2 ainda");
  });
});
