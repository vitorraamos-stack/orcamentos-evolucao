import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = [
  "20261109160001_dashboard_operational_thresholds_stage1.sql",
  "20261109160002_dashboard_sector_calendars_stage1.sql",
  "20261109160003_dashboard_calendar_successions_stage1.sql",
  "20261109160004_dashboard_calendar_retro_requests_stage1.sql",
  "20261109160005_dashboard_calendar_retro_review_triage_stage1.sql",
  "20261109160006_dashboard_calendar_retro_candidates_stage1.sql",
  "20261109160007_dashboard_calendar_retro_approval_preflight_stage1.sql",
] as const;

const sql = migrations.map(name => readFileSync(
  resolve(process.cwd(), "supabase/migrations", name), "utf8",
));
const all = sql.join("\n");

describe("Dashboard — prontidão estática das migrations propostas (sem executar SQL)", () => {
  it("mantém dependências em ordem e não perde migrations no PR", () => {
    expect([...migrations].sort()).toEqual([...migrations]);
    expect(sql[0]).toContain("CREATE TABLE public.dashboard_operational_thresholds");
    expect(sql[1]).toContain("CREATE TABLE public.dashboard_sector_calendar_revisions");
    expect(sql[2]).toContain("CREATE FUNCTION public.dashboard_publish_calendar_successor");
    expect(sql[3]).toContain("CREATE TABLE public.dashboard_calendar_retro_review_requests");
    expect(sql[4]).toContain("CREATE TABLE public.dashboard_calendar_retro_review_events");
    expect(sql[5]).toContain("CREATE FUNCTION public.dashboard_list_calendar_retro_candidate_orders");
    expect(sql[6]).toContain("CREATE TABLE public.dashboard_calendar_retro_approval_dossiers");
    expect(sql[6]).toContain("CREATE FUNCTION public.dashboard_preview_calendar_retro_full_stage_alerts");
  });

  it("não contém terminadores de função incorretos ou corpos SQL desequilibrados", () => {
    for (const source of sql) {
      expect(source).not.toMatch(/AS \$\s*\n/);
      expect(source).not.toMatch(/END \$;/);
      const openings = (source.match(/AS \$\$/g) ?? []).length;
      const closings = (source.match(/END \$\$;/g) ?? []).length;
      expect(openings).toBeGreaterThan(0);
      expect(closings).toBe(openings);
    }
  });

  it("restringe toda RPC acessível a autenticados com verificação de gestão", () => {
    for (const source of sql) {
      const functions = [...source.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\(/g)];
      for (let i = 0; i < functions.length; i++) {
        const fn = functions[i][1];
        const body = source.slice(functions[i].index!, functions[i + 1]?.index ?? source.length);
        const granted = source.includes("GRANT EXECUTE ON FUNCTION public." + fn + "(");
        if (!granted) continue;
        expect(body, fn + " must check manager").toContain("public.dashboard_assert_manager()");
        expect(body, fn + " must pin search_path").toContain("SET search_path=''");
        expect(body, fn + " must be an explicitly protected RPC").toContain("SECURITY DEFINER");
        expect(source, fn + " must revoke inherited EXECUTE")
          .toContain("REVOKE ALL ON FUNCTION public." + fn + "(");
      }
    }
  });

  it("protege tabelas auditáveis por RLS e impede mutações diretas", () => {
    const immutable = [
      "dashboard_operational_threshold_revisions",
      "dashboard_sector_calendar_revisions",
      "dashboard_calendar_succession_audit",
      "dashboard_calendar_retro_review_requests",
      "dashboard_calendar_retro_review_events",
      "dashboard_calendar_retro_approval_dossiers",
    ];
    for (const name of immutable) {
      expect(all).toContain("CREATE TABLE public." + name);
      expect(all).toContain("ALTER TABLE public." + name + " ENABLE ROW LEVEL SECURITY");
      expect(all).toContain("ON public." + name + "\n");
      const revokes = all.match(/REVOKE ALL ON[^;]+;/g) ?? [];
      expect(revokes.some(statement => statement.includes("public." + name))).toBe(true);
      expect(all).toMatch(new RegExp(
        "CREATE TRIGGER[^;]*BEFORE UPDATE OR DELETE ON public\\." + name
      ));
    }
  });

  it("mantém prévias sem autorização e evita escrituras em OS ou calendários existentes", () => {
    const approvalSql = sql[6];
    expect(approvalSql).toContain("'approval_allowed',false");
    expect(approvalSql).toContain("'application_allowed',false");
    expect(approvalSql).toContain("'historical_coverage_verified',false");
    expect(approvalSql).toContain("'alerts_verified',false");
    expect(approvalSql).not.toMatch(
      /(?:UPDATE|INSERT INTO|DELETE FROM)\s+public\.(?:os_orders|dashboard_work_calendar_versions|dashboard_work_calendar_periods|dashboard_work_calendar_exceptions|dashboard_stage_intervals)/i
    );
  });
});
