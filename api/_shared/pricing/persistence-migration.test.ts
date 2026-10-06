import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261006160302_pricing_persistence_16c2.sql", import.meta.url),
  "utf8"
);

describe("Pricing persistence migration contract", () => {
  it("uses complete PL/pgSQL dollar delimiters", () => {
    expect(sql).not.toMatch(/^as \$$/m);
    const opens = (sql.match(/^as \$\$/gm) ?? []).length;
    const closes = (sql.match(/^\$\$;$/gm) ?? []).length;
    expect(opens).toBe(closes);
  });
  it.each([
    "pricing_policies",
    "pricing_policy_versions",
    "product_pricing_settings",
    "pricing_payment_terms",
    "pricing_audit_events",
  ])("creates and enables RLS on %s", table => {
    expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it("does not persist v1 policy charges or legacy price sources", () => {
    expect(sql).not.toMatch(/create table public\.pricing_policy_charges/i);
    expect(sql).not.toMatch(/materials\.min_price|price_tiers|Home\.tsx/i);
  });

  it("locks the persisted v1 strategy to MARKUP_ON_COST over TOTAL_COST", () => {
    expect(sql).toContain("strategy_type = 'MARKUP_ON_COST'");
    expect(sql).toContain("markup_base = 'TOTAL_COST'");
    expect(sql).toContain("'charges', '[]'::jsonb");
  });

  it("enforces one published version per policy", () => {
    expect(sql).toMatch(
      /create unique index pricing_policy_versions_one_published_idx[\s\S]*where status = 'PUBLISHED'/i
    );
  });

  it("enforces free installments from 1x through 3x", () => {
    expect(sql).toMatch(/installments > 3 or rate = 0/i);
  });

  it("rejects PostgreSQL special numeric values at the persistence boundary", () => {
    expect(sql).toContain("markup::text not in ('NaN','Infinity','-Infinity')");
    expect(sql).toContain("minimum_selling_price::text not in ('NaN','Infinity','-Infinity')");
    expect(sql).toContain("rate::text not in ('NaN','Infinity','-Infinity')");
  });

  it("keeps lifecycle RPC payloads free of numeric financial fields", () => {
    const transitionStart = sql.indexOf("create function public.pricing_transition_version_secure");
    const publishStart = sql.indexOf("create function public.pricing_publish_version_secure");
    const productStart = sql.indexOf("create function public.pricing_set_product_settings_secure");
    const transition = sql.slice(transitionStart, publishStart);
    const publish = sql.slice(publishStart, productStart);
    expect(transition).not.toContain("return to_jsonb(v_after)");
    expect(publish).not.toContain("return to_jsonb(v_target)");
    expect(transition).not.toMatch(/'markup'\s*,/i);
    expect(publish).not.toMatch(/'markup'\s*,/i);
  });

  it("casts every persisted financial value to text in RPC output/audit", () => {
    expect(sql).toContain("'markup', v.markup::text");
    expect(sql).toContain("'minimum_selling_price', s.minimum_selling_price::text");
    expect(sql).toContain("'rate', t.rate::text");
  });

  it("keeps trigger functions unavailable to browser roles", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.pricing_guard_policy\(\) from public, anon, authenticated, service_role/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.pricing_guard_policy\(\) to service_role/i
    );
  });

  it("keeps admin RPCs server-only", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.pricing_create_policy_secure[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.pricing_create_policy_secure[\s\S]*to service_role/i
    );
  });

  it("does not grant table writes to browser roles", () => {
    expect(sql).not.toMatch(/grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]*to\s+(?:anon|authenticated)/i);
    expect(sql).toMatch(/revoke all on table public\.pricing_policies from public, anon, authenticated, service_role/i);
  });

  it("does not grant destructive privileges to service_role", () => {
    expect(sql).not.toMatch(/grant[^;]*(?:delete|truncate|references|trigger|maintain)[^;]*to service_role/i);
  });

  it("does not seed literal real commercial values", () => {
    expect(sql).not.toMatch(
      /insert into public\.pricing_payment_terms\s*\(\s*installments\s*,\s*rate[^)]*\)\s*values\s*\(\s*(?:4|5|6|7|8|9|10|11|12)\s*,/i
    );
    expect(sql).not.toMatch(
      /insert into public\.product_pricing_settings\s*\([^)]*\)\s*values\s*\(\s*'[0-9a-f-]{36}'/i
    );
  });

  it("advances revision on VALIDATING to DRAFT to prevent ABA stale writes", () => {
    const start = sql.indexOf("create function public.pricing_transition_version_secure");
    const end = sql.indexOf("create function public.pricing_publish_version_secure");
    const transition = sql.slice(start, end);
    expect(transition).toContain("when v_before.status='VALIDATING' and p_target_status='DRAFT'");
    expect(transition).toContain("then revision+1");
    expect(sql).toContain("new.revision <> old.revision + 1");
  });

  it("uses optimistic revision checks and publication compare-and-swap", () => {
    expect(sql).toContain("PRICING_REVISION_CONFLICT");
    expect(sql).toContain("PRICING_PUBLICATION_CONFLICT");
    expect(sql).toContain("p_expected_current_published_version_id");
    expect(sql).toMatch(/for update/i);
  });

  it("keeps audit append-only", () => {
    expect(sql).toContain("pricing_audit_events_append_only");
    expect(sql).toContain("PRICING_AUDIT_APPEND_ONLY");
  });
});
