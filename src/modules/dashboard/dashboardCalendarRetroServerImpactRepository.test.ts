import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRetroServerDayImpact } from "./dashboardCalendarRetroServerImpactRepository";

const preview = {
  request_id: "req-1", exception_date: "2026-11-06",
  as_of: "2026-11-09T15:00:00.000Z", candidate_orders: 1,
  candidate_intervals: 1, verified_intervals: 1,
  insufficient_intervals: 0, changed_intervals: 1,
  rows: [{
    order_id: "order-1", interval_id: "stage-1", scope: "PRODUCTION",
    state: "verified", reason: "Cálculo do dia",
    minutes_before: 180, minutes_proposed: 0,
    pause_minutes_before: 30, pause_minutes_proposed: 0,
    useful_minutes_before: 150, useful_minutes_proposed: 0,
  }],
  scope: "calendar_base_single_day",
  historical_coverage_verified: false, alerts_verified: false,
  approval_allowed: false, application_allowed: false,
  observacao: "Prévia somente leitura",
};

describe("prévia de impacto retroativo calculada no Supabase", () => {
  it("aceita apenas resultados coerentes e sempre bloqueados para aplicação", () => {
    expect(validateRetroServerDayImpact(preview, "req-1")).toBe(true);
    expect(validateRetroServerDayImpact({ ...preview, application_allowed: true }, "req-1")).toBe(false);
    expect(validateRetroServerDayImpact({ ...preview, verified_intervals: 0 }, "req-1")).toBe(false);
    expect(validateRetroServerDayImpact({ ...preview, rows: [] }, "req-1")).toBe(false);
    expect(validateRetroServerDayImpact({ ...preview, rows: [
      { ...preview.rows[0], useful_minutes_before: 180 },
    ] }, "req-1")).toBe(false);
    expect(validateRetroServerDayImpact(preview, "another-request")).toBe(false);
  });
  it("mantém RPC gerencial, limites de leitura e exclusão de efeitos históricos", () => {
    const sql = readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261109153000_dashboard_calendar_retro_approval_preflight_stage1.sql"
    ), "utf8");
    expect(sql).toContain("CREATE FUNCTION public.dashboard_preview_calendar_retro_day_stage_impact(");
    expect(sql).toContain("PERFORM public.dashboard_assert_manager()");
    expect(sql).toContain("v_stage_count>1200 OR v_order_count>300");
    expect(sql).toContain("pg_catalog.range_agg");
    expect(sql).toContain("jsonb_agg(to_jsonb(sp) ORDER BY sp.id)");
    expect(sql).toContain("jsonb_agg(to_jsonb(sector) ORDER BY sector.id)");
    expect(sql).toContain("jsonb_agg(to_jsonb(rule) ORDER BY rule.id)");
    expect(sql).toContain("dashboard-retro-review:");
    expect(sql).toContain("v_preview IS DISTINCT FROM p_expected_preview");
    expect(sql).toContain("'application_allowed',false");
    expect(sql).toContain("'alerts_verified',false");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.dashboard_preview_calendar_retro_day_stage_impact");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.dashboard_work_calendar_exceptions/i);
  });
});
