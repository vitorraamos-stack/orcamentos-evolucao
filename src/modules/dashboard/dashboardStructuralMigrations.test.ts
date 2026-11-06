import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks run in CI WITHOUT applying migrations to any Supabase project.
 * SQL behavior, RLS and concurrent transactions require separate ephemeral-DB
 * pgTAP/integration tests before the DB migrations can be approved.
 */
const base = "supabase/migrations/";
const foundation = readFileSync(resolve(process.cwd(), base + "20261106150000_dashboard_etapa4_foundation.sql"), "utf8");
const rules = readFileSync(resolve(process.cwd(), base + "20261106150500_dashboard_etapa4_rules_calendar_rpc.sql"), "utf8");
const dependencies = readFileSync(resolve(process.cwd(), base + "20261106151000_dashboard_etapa4_dependency_rpc.sql"), "utf8");

describe("Dashboard Etapa 4 — migration authoring safety checks", () => {
  it("creates no implicit rules, calendar, dependency or stage records", () => {
    expect(foundation).not.toMatch(/INSERT\s+INTO\s+public\.dashboard_(?:operational_rules|work_calendar_versions|stage_intervals)/i);
    expect(foundation).not.toMatch(/INSERT\s+INTO\s+public\.os_item_operation_dependencies/i);
    expect(foundation).toContain("CREATE TABLE public.dashboard_operational_rules");
    expect(foundation).toContain("CREATE TABLE public.os_item_operation_dependencies");
  });
  it("enables RLS and removes direct writes on all nine new tables", () => {
    for (const table of [
      "dashboard_work_calendar_versions", "dashboard_work_calendar_periods",
      "dashboard_work_calendar_exceptions", "dashboard_operational_rules",
      "dashboard_operational_rule_revisions", "os_item_operation_dependencies",
      "dashboard_operation_dependency_audit", "dashboard_stage_intervals",
      "dashboard_stage_pauses",
    ]) expect(foundation).toContain("ALTER TABLE public." + table + " ENABLE ROW LEVEL SECURITY");
    expect(foundation).toContain("FROM PUBLIC, anon, authenticated");
    expect(foundation).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE[\s\S]*?\bTO\s+authenticated/i);
  });
  it("publishes audited rules only with manager check and revision lock", () => {
    expect(rules).toContain("CREATE FUNCTION public.dashboard_assert_manager()");
    expect(rules).toContain("public.is_manager(v_user)");
    expect(rules).toContain("CREATE FUNCTION public.dashboard_publish_rule(");
    expect(rules).toContain("p_expected_revision");
    expect(rules).toContain("pg_advisory_xact_lock");
    expect(rules).toContain("INSERT INTO public.dashboard_operational_rule_revisions");
    expect(rules).toContain("FROM PUBLIC,anon,authenticated");
  });
  it("supports retirada and rejects unsupported approval/logistics requirements", () => {
    expect(rules).toContain("'retirada','entrega','instalacao'");
    expect(rules).toContain("p_scope='APPROVAL'");
    expect(rules).toContain("p_scope='LOGISTICS'");
    expect(rules).toContain("public.scoped_rule_scope(p_scope)");
  });
  it("validates the calendar and rejects overlapping local work periods", () => {
    expect(rules).toContain("CREATE FUNCTION public.dashboard_publish_calendar(");
    expect(rules).toContain("jsonb_array_elements(p_periods)");
    expect(rules).toContain("v_start<p.ends_local AND v_end>p.starts_local");
    expect(rules).toContain("dashboard_work_calendar_exceptions");
    expect(rules).toContain("America/Sao_Paulo");
  });
  it("checks same-OS status and transitive cycles before link creation", () => {
    expect(dependencies).toContain("CREATE FUNCTION public.dashboard_link_operations(");
    expect(dependencies).toContain("p_predecessor_id=p_successor_id");
    expect(dependencies).toContain("op.deleted_at IS NULL");
    expect(dependencies).toContain("item.status<>'CANCELLED'");
    expect(dependencies).toContain("WITH RECURSIVE reachable(id) AS");
    expect(dependencies).not.toContain("pg_catalog.hashtextextended"); // lock is per OS row
    expect(dependencies).toContain("FOR UPDATE");
    expect(dependencies).toContain("INSERT INTO public.dashboard_operation_dependency_audit");
  });
  it("audits cleanup when existing operational records are cancelled or deleted", () => {
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_operation");
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_item");
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_order");
    expect(dependencies).toContain("OLD.status<>'CANCELLED' AND NEW.status='CANCELLED'");
    expect(dependencies).toContain("'REMOVED',auth.uid()");
  });
});
