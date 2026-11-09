import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(), "supabase/migrations/20261109115000_dashboard_operational_thresholds_stage1.sql",
), "utf8");

describe("Dashboard novas decisões — migration de Atenção/Crítico (contrato estático)", () => {
  it("não publica limites ou calendários implícitos e não modifica dados das OS", () => {
    expect(sql).toContain("CREATE TABLE public.dashboard_operational_thresholds");
    expect(sql).toContain("CREATE TABLE public.dashboard_operational_threshold_revisions");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.(os_orders|dashboard_work_calendar_versions)\b/i);
    // INSERT é permitido apenas dentro da RPC gerencial, nunca como seed de migration.
    expect(sql.indexOf("INSERT INTO public.dashboard_operational_thresholds"))
      .toBeGreaterThan(sql.indexOf("CREATE FUNCTION public.dashboard_publish_thresholds("));
    expect(sql).not.toMatch(/\bUPDATE\s+public\.os_orders\b/i);
  });

  it("mantém limites positivos, crítico acima de atenção e vínculo com calendário", () => {
    expect(sql).toContain("CHECK(attention_limit_minutes > 0)");
    expect(sql).toContain("CHECK(critical_limit_minutes > attention_limit_minutes)");
    expect(sql).toContain("REFERENCES public.dashboard_work_calendar_versions");
    expect(sql).toContain("p_critical_minutes<=p_attention_minutes");
  });

  it("aplica RLS a tabelas novas e nega mutações diretas", () => {
    for (const table of [
      "dashboard_operational_thresholds", "dashboard_operational_threshold_revisions",
    ]) expect(sql).toContain("ALTER TABLE public." + table + " ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role;");
    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\.dashboard_operational_threshold/i);
    expect(sql).toContain("dashboard_threshold_history_immutable");
  });

  it("autoriza publicação somente por gestor, com revisão e auditoria", () => {
    expect(sql).toContain("public.dashboard_assert_manager()");
    expect(sql).toContain("p_expected_revision");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("dashboard_operational_threshold_revisions");
    expect(sql).toContain("p_reason");
  });

  it("deixa claro que a prévia é conservadora, não insere dados reais", () => {
    expect(sql).toContain("CREATE FUNCTION public.dashboard_preview_thresholds(");
    expect(sql).toContain("'impacto_verificado',false");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.dashboard_stage_intervals/i);
  });
});
