import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations/" + name), "utf8");

const succession = migration("20261109131500_dashboard_calendar_successions_stage1.sql");
const retro = migration("20261109134000_dashboard_calendar_retro_requests_stage1.sql");
const preflight = migration("20261109153000_dashboard_calendar_retro_approval_preflight_stage1.sql");
const review = migration("20261109142500_dashboard_calendar_retro_review_triage_stage1.sql");

describe("Dashboard Etapa 1 — segurança de versões globais prospectivas", () => {
  it("não reescreve calendários, horas ou exceções anteriores", () => {
    expect(succession).not.toMatch(/UPDATE\s+public\.dashboard_work_calendar_(?:versions|periods|exceptions)/i);
    expect(succession).not.toMatch(/DELETE\s+FROM\s+public\.dashboard_work_calendar_/i);
    expect(succession).not.toMatch(/INSERT\s+INTO\s+public\.os_orders/i);
    expect(succession).toContain("CREATE TABLE public.dashboard_calendar_succession_audit");
    expect(succession).toContain("dashboard_calendar_succession_audit_immutable");
  });
  it("não permite a RPC legada inserir versão retroativa sem autorização", () => {
    expect(succession).toContain("CREATE TRIGGER dashboard_calendar_no_implicit_backdate");
    expect(succession).toContain("BEFORE INSERT ON public.dashboard_work_calendar_versions");
    expect(succession).toContain("NEW.effective_from < (now() AT TIME ZONE 'America/Sao_Paulo')::date");
  });
  it("publica sucessora somente com gestão e revisão otimista", () => {
    expect(succession).toContain("public.dashboard_assert_manager()");
    expect(succession).toContain("p_expected_last_version");
    expect(succession).toContain("pg_advisory_xact_lock");
    expect(succession).toContain("dashboard_validate_calendar_successor_date(");
    expect(succession).toContain("GRANT EXECUTE ON FUNCTION public.dashboard_publish_calendar_successor(");
  });
  it("prévia apresenta candidatos e nunca inventa horas ou alertas", () => {
    expect(succession).toContain("CREATE FUNCTION public.dashboard_preview_calendar_successor(");
    expect(succession).toContain("'duration_impact_verified',false");
    expect(succession).toContain("stage_intervals_from_effective_date");
  });
});

describe("Dashboard Etapa 1 — segurança das solicitações retroativas", () => {
  it("não modifica calendários nem altera OS por solicitações pendentes", () => {
    expect(retro).toContain("CREATE TABLE public.dashboard_calendar_retro_review_requests");
    expect(retro).toContain("CHECK (state='pending_review')");
    expect(retro).not.toMatch(/UPDATE\s+public\.dashboard_work_calendar_(?:versions|periods|exceptions)/i);
    expect(retro).not.toMatch(/DELETE\s+FROM\s+public\.dashboard_work_calendar_/i);
    expect(retro).not.toMatch(/UPDATE\s+public\.os_orders/i);
  });
  it("exige gestor, RLS, histórico imutável e RPCs privadas", () => {
    expect(retro).toContain("public.dashboard_assert_manager()");
    expect(retro).toContain("ALTER TABLE public.dashboard_calendar_retro_review_requests ENABLE ROW LEVEL SECURITY");
    expect(retro).toContain("dashboard_retro_review_immutable");
    expect(retro).toContain("REVOKE ALL ON FUNCTION public.dashboard_request_calendar_retro_review(");
    expect(retro).toContain("GRANT EXECUTE ON FUNCTION public.dashboard_request_calendar_retro_review(");
  });
  it("faz a prévia somente no dia pertencente à versão vigente e marca impacto não verificado", () => {
    expect(retro).toContain("p_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(retro).toContain("ORDER BY c.effective_from DESC,c.version DESC");
    expect(retro).toContain("'duration_impact_verified',false");
    expect(retro).toContain("stage_intervals_candidates");
  });
});


describe("Dashboard Etapa 1 — revisão gerencial sem aplicação", () => {
  it("exige gestão, auditoria imutável, prévia fresca e bloqueia aprovação", () => {
    expect(review).toContain("public.dashboard_assert_manager()");
    expect(review).toContain("dashboard_retro_review_events_immutable");
    expect(review).toContain("p_expected_preview");
    expect(review).toContain("'approval_allowed',false");
    expect(review).toContain("action IN ('needs_evidence','rejected')");
    expect(review).not.toMatch(/UPDATE\s+public\.(?:dashboard_work_calendar_|os_orders)/i);
    expect(review).not.toMatch(/DELETE\s+FROM\s+public\.dashboard_work_calendar_/i);
  });
  it("corrige a delimitação SQL e permite reenvio após rejeição auditada", () => {
    expect(succession).not.toContain("AS $\n");
    expect(review).toContain("CREATE OR REPLACE FUNCTION public.dashboard_request_calendar_retro_review(");
    expect(review).toContain("e.action='rejected'");
    expect(review).toContain("dashboard-retro-review:");
  });
});


describe("Dashboard Etapa 1 — preparação de aprovação sem efeito operacional", () => {
  it("só permite encaminhar para validação, sem aprovação ou aplicação de exceções", () => {
    expect(preflight).toContain("CREATE TABLE public.dashboard_calendar_retro_approval_dossiers");
    expect(preflight).toContain("CHECK (status = 'awaiting_server_verification')");
    expect(preflight).toContain("'approval_allowed',false");
    expect(preflight).toContain("'application_allowed',false");
    expect(preflight).toContain("dashboard_retro_approval_dossiers_immutable");
    expect(preflight).not.toMatch(/(?:UPDATE|DELETE)\s+public\.dashboard_work_calendar_/i);
    expect(preflight).not.toMatch(/INSERT\s+INTO\s+public\.dashboard_work_calendar_exceptions/i);
  });
  it("autoriza somente gestão e exige recálculo de prévia no servidor", () => {
    expect(preflight).toContain("public.dashboard_assert_manager()");
    expect(preflight).toContain("v_preview := public.dashboard_preview_calendar_retro_approval_preflight(p_request_id)");
    expect(preflight).toContain("v_preview IS DISTINCT FROM p_expected_preview");
    expect(preflight).toContain("GRANT EXECUTE ON FUNCTION public.dashboard_prepare_calendar_retro_approval");
  });
});
