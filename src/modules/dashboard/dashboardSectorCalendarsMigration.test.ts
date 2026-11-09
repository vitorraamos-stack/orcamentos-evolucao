import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(
  process.cwd(), "supabase/migrations/20261109215212_dashboard_sector_calendars_stage1.sql",
), "utf8");

describe("Dashboard Etapa 1 — contrato estático da migration setorial", () => {
  it("cria snapshots de calendário, sem seed nem alterações de OS", () => {
    expect(sql).toContain("CREATE TABLE public.dashboard_sector_calendar_revisions");
    expect(sql).toContain("UNIQUE (scope,base_calendar_version_id,revision)");
    expect(sql).toContain("UNIQUE (scope,base_calendar_version_id,effective_from)");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.dashboard_work_calendar_versions/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.os_orders/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.os_orders/i);
  });

  it("rejeita gravação direta e mantém histórico imutável por RLS", () => {
    expect(sql).toContain("ALTER TABLE public.dashboard_sector_calendar_revisions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT ON TABLE public.dashboard_sector_calendar_revisions TO authenticated");
    expect(sql).toContain("REVOKE ALL ON TABLE public.dashboard_sector_calendar_revisions");
    expect(sql).toContain("dashboard_sector_calendar_revision_immutable");
    expect(sql).toContain("public.dashboard_reject_audit_mutation()");
    expect(sql).toContain("public.has_module_access(auth.uid(),'hub_os')");
  });

  it("requer gestão, revisão esperada e impede mudanças retroativas silenciosas", () => {
    expect(sql).toContain("public.dashboard_assert_manager()");
    expect(sql).toContain("p_expected_revision");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("p_effective_from < (now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(sql).toContain("p_effective_from<=v_last.effective_from");
    expect(sql).toContain("v_current_revision<>p_expected_revision");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.dashboard_publish_sector_calendar(");
  });

  it("valida turnos, exceções, sobreposições e vigência do calendário base", () => {
    expect(sql).toContain("jsonb_array_elements(p_periods)");
    expect(sql).toContain("jsonb_array_elements(p_exceptions)");
    expect(sql).toContain("Turnos setoriais sobrepostos");
    expect(sql).toContain("Turnos especiais sobrepostos");
    expect(sql).toContain("v_base.effective_until");
    expect(sql).toContain("Exceção duplicada ou fora da vigência");
  });
});
