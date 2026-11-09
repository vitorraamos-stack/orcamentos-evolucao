import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
import { validateRetroFullStagePreview } from "./dashboardCalendarRetroFullStageRepository";

const valid = {
  request_id: "request-1", as_of: "2026-11-09T16:45:00.000Z",
  candidate_orders: 1, candidate_intervals: 1,
  verified_intervals: 1, insufficient_intervals: 0, candidate_alert_changes: 1,
  rows: [{
    order_id: "order-1", interval_id: "interval-1", scope: "PRODUCTION",
    state: "verified", reason: "Prévia consultiva",
    gross_before: 360, gross_proposed: 240,
    pause_before: 30, pause_proposed: 30,
    useful_before: 330, useful_proposed: 210,
    severity_before: "critical", severity_proposed: "attention",
    severity_status: "candidate",
  }],
  scope: "full_stage_consultative",
  historical_coverage_verified: false, alerts_verified: false,
  approval_allowed: false, application_allowed: false,
  observacao: "Somente leitura; não autoriza aprovação",
};

describe("prévia integral de alertas e pausas por OS", () => {
  it("aceita a contagem coerente, sempre consultiva", () => {
    expect(validateRetroFullStagePreview(valid, "request-1")).toBe(true);
    expect(validateRetroFullStagePreview({ ...valid, application_allowed: true }, "request-1"))
      .toBe(false);
    expect(validateRetroFullStagePreview({ ...valid, alerts_verified: true }, "request-1"))
      .toBe(false);
    expect(validateRetroFullStagePreview({ ...valid, candidate_alert_changes: 0 }, "request-1"))
      .toBe(false);
    expect(validateRetroFullStagePreview({ ...valid, rows: [] }, "request-1")).toBe(false);
    expect(validateRetroFullStagePreview(valid, "wrong-request")).toBe(false);
  });

  it("recusa níveis de alerta sem evidência e pausas inconsistentes", () => {
    const first = valid.rows[0];
    expect(validateRetroFullStagePreview({
      ...valid, rows: [{ ...first, severity_status: "threshold_unverified" }],
    }, "request-1")).toBe(false);
    expect(validateRetroFullStagePreview({
      ...valid, rows: [{ ...first, pause_before: 400 }],
    }, "request-1")).toBe(false);
    expect(validateRetroFullStagePreview({
      ...valid, rows: [{ ...first, useful_before: 359 }],
    }, "request-1")).toBe(false);
    expect(validateRetroFullStagePreview({
      ...valid, rows: [
        { ...first }, { ...first },
      ], candidate_intervals: 2, verified_intervals: 2,
    }, "request-1")).toBe(false);
    const insufficient = {
      ...first, state: "insufficient", reason: "Calendário setorial inconclusivo",
      gross_before: null, gross_proposed: null, pause_before: null, pause_proposed: null,
      useful_before: null, useful_proposed: null, severity_before: null,
      severity_proposed: null, severity_status: "unavailable",
    };
    expect(validateRetroFullStagePreview({
      ...valid, rows: [insufficient], verified_intervals: 0,
      insufficient_intervals: 1, candidate_alert_changes: 0,
    }, "request-1")).toBe(true);
  });

  it("exige permissão gerencial e mantém o cálculo somente leitura no servidor", () => {
    const sql = readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261109160007_dashboard_calendar_retro_approval_preflight_stage1.sql"
    ), "utf8");
    const start = sql.indexOf("CREATE FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts(");
    expect(start).toBeGreaterThan(0);
    const functionBody = sql.slice(start);
    expect(functionBody).toContain("PERFORM public.dashboard_assert_manager()");
    expect(functionBody).toContain("v_total>1200 OR v_candidate_orders>300");
    expect(functionBody).toContain("v_last_day-v_start_day>365");
    expect(functionBody).toContain("pg_catalog.range_agg");
    expect(functionBody).toContain("dashboard_sector_calendar_revisions");
    expect(functionBody).toContain("'approval_allowed',false");
    expect(functionBody).toContain("'application_allowed',false");
    expect(functionBody).toContain("'alerts_verified',false");
    expect(functionBody).toContain("REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts");
    expect(functionBody).not.toMatch(/(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+public\.(?:os_orders|dashboard_work_calendar_exceptions|dashboard_stage_intervals)/i);
  });
});
