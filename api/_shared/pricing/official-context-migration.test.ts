import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261006163140_official_pricing_calculation_context.sql",
    import.meta.url
  ),
  "utf8"
);

describe("Official Pricing context migration", () => {
  it("creates one stable SECURITY INVOKER server-only RPC", () => {
    expect(sql).toContain(
      "create function public.pricing_get_official_calculation_context_secure"
    );
    expect(sql).toMatch(/\bstable\b/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toMatch(
      /revoke execute on function public\.pricing_get_official_calculation_context_secure\(uuid,integer\)[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.pricing_get_official_calculation_context_secure\(uuid,integer\)[\s\S]*to service_role/i
    );
  });

  it("fails closed for missing or unavailable official configuration", () => {
    for (const sentinel of [
      "PRODUCT_PRICING_SETTINGS_NOT_FOUND",
      "PRICING_POLICY_NOT_FOUND",
      "PRICING_POLICY_NOT_ACTIVE",
      "PRICING_PUBLISHED_VERSION_NOT_FOUND",
      "PRICING_PAYMENT_TERM_NOT_FOUND",
    ])
      expect(sql).toContain(sentinel);
  });

  it("resolves 1x-3x deterministically without inventing persisted payment rows", () => {
    expect(sql).toContain("if p_installments <= 3 then");
    expect(sql).toContain("'source', 'SYSTEM_ZERO'");
    expect(sql).toContain("'rate', '0'");
    expect(sql).toContain("'revision', null");
  });

  it("requires configured payment terms from 4x through 12x", () => {
    expect(sql).toMatch(
      /else[\s\S]*from public\.pricing_payment_terms[\s\S]*PRICING_PAYMENT_TERM_NOT_FOUND/i
    );
    expect(sql).toContain("'source', 'CONFIGURED'");
  });

  it("keeps all financial decimals textual at the JSON boundary", () => {
    expect(sql).toContain("'markup', v_version.markup::text");
    expect(sql).toContain(
      "'minimum_selling_price', v_settings.minimum_selling_price::text"
    );
    expect(sql).toContain("'rate', v_payment.rate::text");
  });

  it("returns an explicit empty v1 charges array", () => {
    expect(sql).toContain("'charges', '[]'::jsonb");
  });

  it("does not create or mutate commercial tables or seed data", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/insert into/i);
    expect(sql).not.toMatch(/update public\./i);
    expect(sql).not.toMatch(/delete from/i);
  });
});
