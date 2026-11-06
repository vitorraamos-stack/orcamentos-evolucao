import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks run in CI without applying SQL to a Supabase project.
 * Production schema and permission checks are recorded separately; pgTAP and
 * concurrent-transaction stress tests are intentionally not run against production.
 */
const base = "supabase/migrations/";
const foundation = readFileSync(resolve(process.cwd(), base + "20261106181834_dashboard_etapa4_foundation.sql"), "utf8");
const rules = readFileSync(resolve(process.cwd(), base + "20261106181837_dashboard_etapa4_rules_calendar_rpc.sql"), "utf8");
const dependencies = readFileSync(resolve(process.cwd(), base + "20261106181942_dashboard_etapa4_dependency_rpc.sql"), "utf8");
const stageEvents = readFileSync(resolve(process.cwd(), base + "20261106192023_dashboard_etapa4_stage_event_instrumentation.sql"), "utf8");

describe("Dashboard Etapa 4 — migration safety contracts", () => {
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
    expect(foundation).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(foundation).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE[\s\S]*?\bTO\s+authenticated/i);
  });

  it("publishes audited rules only with manager check and revision lock", () => {
    expect(rules).toContain("CREATE FUNCTION public.dashboard_assert_manager()");
    expect(rules).toContain("public.is_manager(v_user)");
    expect(rules).toContain("CREATE FUNCTION public.dashboard_publish_rule(");
    expect(rules).toContain("p_expected_revision");
    expect(rules).toContain("pg_advisory_xact_lock");
    expect(rules).toContain("INSERT INTO public.dashboard_operational_rule_revisions");
    expect(rules).toContain("FROM PUBLIC,anon,authenticated,service_role");
  });

  it("supports retirada and rejects unsupported approval/logistics requirements", () => {
    expect(rules).toContain("'retirada','entrega','instalacao'");
    expect(rules).toContain("p_scope='APPROVAL'");
    expect(rules).toContain("p_scope='LOGISTICS'");
    expect(rules).toContain("a.scope IN (p_scope, 'GENERAL')");
  });

  it("validates calendar periods and rejects overlap", () => {
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
    expect(dependencies).not.toContain("pg_catalog.hashtextextended");
    expect(dependencies).toContain("FOR UPDATE");
    expect(dependencies).toContain("INSERT INTO public.dashboard_operation_dependency_audit");
  });

  it("audits cleanup when source operations, items or orders are cancelled or deleted", () => {
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_operation");
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_item");
    expect(dependencies).toContain("CREATE TRIGGER dashboard_dependency_cleanup_order");
    expect(dependencies).toContain("OLD.status<>'CANCELLED' AND NEW.status='CANCELLED'");
    expect(dependencies).toContain("'REMOVED',auth.uid()");
    expect(dependencies).toContain("Cada ramo usa somente campos existentes no tipo de linha OLD");
    expect(dependencies).not.toContain("TG_TABLE_NAME='os_orders' AND d.order_id=OLD.id");
  });

  it("captures real stage transitions and blocked pauses without historical backfill", () => {
    expect(stageEvents).toContain("AFTER INSERT OR UPDATE OF art_status,prod_status,archived");
    expect(stageEvents).toContain("BEFORE INSERT OR UPDATE OF status,item_id,deleted_at OR DELETE");
    expect(stageEvents).toContain("BEFORE UPDATE OF status,deleted_at,order_id OR DELETE");
    expect(stageEvents).toContain("dashboard_stage_interval_order_transition");
    expect(stageEvents).toContain("dashboard_stage_pause_operation_status");
    expect(stageEvents).toContain("dashboard_stage_pause_item_change");
    expect(stageEvents).toContain("'verified'");
    expect(stageEvents).toContain("'unverified'");
    expect(stageEvents).toContain("ELSE NULL");
    expect(stageEvents).toContain("REVOKE ALL ON FUNCTION public.dashboard_capture_operation_pause()");
    expect(stageEvents).toContain("não afirma quando a etapa começou");
  });
});
