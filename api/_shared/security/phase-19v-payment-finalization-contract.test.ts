import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePaymentStatus } from "@/modules/hub-os/utils";

const sql = readFileSync(
  "docs/tasks/phase-19v-atomic-finalization-PROPOSAL.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("19V proposal contract — static only, NOT SQL execution", () => {
  it("is clearly labeled non-deployable and stays outside migrations", () => {
    expect(sql).toContain("REVIEW ONLY, NOT A MIGRATION");
    expect(sql).toContain("DO NOT EXECUTE");
    expect(sql).toContain("19V_ABORTED_19T_GUARD_DRIFT");
  });

  it("proposes a caller-scoped single RPC with no client-supplied target status", () => {
    expect(sql).toContain("finalize_legacy_payment_submission(p_proof_id uuid)");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("current_user <> 'authenticated'");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.has_module_access(v_actor, 'hub_os')");
    expect(sql).toContain("p.created_by = v_actor");
    expect(sql).toContain("FROM PUBLIC, anon, service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).not.toContain("p_status text");
  });

  it("orders deterministic locks, status update and evidence insert", () => {
    const osLock = sql.indexOf("FROM public.os AS o WHERE o.id = v_os_id FOR UPDATE");
    const proofLock = sql.indexOf("p.os_id = v_order.id AND p.created_by = v_actor\n  FOR UPDATE");
    const mutation = sql.indexOf("UPDATE public.os AS o");
    const evidence = sql.indexOf("INSERT INTO public.os_event (os_id, type, payload, created_by)");
    expect(osLock).toBeGreaterThan(-1);
    expect(proofLock).toBeGreaterThan(osLock);
    expect(mutation).toBeGreaterThan(proofLock);
    expect(evidence).toBeGreaterThan(mutation);
    expect(sql).toContain("os_event_payment_submission_once");
    expect(sql).toContain("already_submitted");
    expect(sql).toContain("19V_PROOF_NOT_OWNED");
    expect(sql).toContain("19V_INCOMPLETE_ATTACHMENT");
  });

  it("checks intended SQL status conditions and São Paulo calendar", () => {
    expect(sql).toContain("v_proof.method = 'AGENDADO'");
    expect(sql).toContain("v_proof.amount >= v_order.quote_total");
    expect(sql).toContain("America/Sao_Paulo");
    expect(sql).toContain("ELSE 'UNDER_REVIEW'");
  });
});

describe("19V existing client payment-status policy: synthetic regression", () => {
  afterEach(() => vi.useRealTimers());

  it("prioritizes scheduled payments over amount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    expect(resolvePaymentStatus({
      method: "AGENDADO", amount: 250, quoteTotal: 100, receivedDate: "2026-10-15",
    })).toBe("SCHEDULED");
  });

  it("marks a full amount received today as released", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    expect(resolvePaymentStatus({
      method: "PIX", amount: 180, quoteTotal: 180, receivedDate: "2026-10-15",
    })).toBe("RELEASED");
  });

  it("does not release partial or older payments", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    for (const [amount, date] of [[179, "2026-10-15"], [180, "2026-10-14"]] as const) {
      expect(resolvePaymentStatus({
        method: "PIX", amount, quoteTotal: 180, receivedDate: date,
      })).toBe("UNDER_REVIEW");
    }
  });

  it("does not release without a valid quote total", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
    expect(resolvePaymentStatus({
      method: "CARTAO", amount: 180, quoteTotal: null, receivedDate: "2026-10-15",
    })).toBe("UNDER_REVIEW");
  });
});
