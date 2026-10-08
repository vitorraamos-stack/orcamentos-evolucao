import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261008140144_quote_negotiation_persistence_18g.sql";
const migration = readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n");
const service = readFileSync(
  "api/_shared/quotes/persistenceService.ts",
  "utf8"
).replaceAll("\r\n", "\n");
const publicContract = readFileSync(
  "shared/quotes/persistence.ts",
  "utf8"
).replaceAll("\r\n", "\n");

describe("Quote negotiation migration 18G", () => {
  it("is additive and does not backfill immutable Quote snapshots", () => {
    expect(migration).toContain(
      "add column official_total_selling_price numeric"
    );
    expect(migration).toContain("add column minimum_allowed_total numeric");
    expect(migration).toContain(
      "add column negotiation_private_snapshot jsonb"
    );
    expect(migration).not.toMatch(/update\s+public\.quote_snapshots/i);
    expect(migration).not.toMatch(
      /official_total_selling_price\s+numeric\s+not\s+null/i
    );
  });

  it("creates v3 RPCs and the runtime persists new snapshots through them", () => {
    expect(migration).toContain("quote_create_with_snapshot_v3_secure");
    expect(migration).toContain("quote_append_snapshot_v3_secure");
    expect(service).toContain('"quote_create_with_snapshot_v3_secure"');
    expect(service).toContain('"quote_append_snapshot_v3_secure"');
    expect(service).not.toContain('"quote_create_with_snapshot_v2_secure"');
    expect(service).not.toContain('"quote_append_snapshot_v2_secure"');
    expect(migration).toContain(
      "payment_rate_source,payment_term_revision,installation_settings_revision"
    );
    expect(migration).not.toContain(
      "payment_rate_source,p_payment_term_revision,installation_settings_revision"
    );
  });

  it("uses SECURITY INVOKER and fixed search_path for every new function", () => {
    expect(migration).not.toMatch(/security\s+definer/i);
    const invokers = migration.match(/security\s+invoker/gi) ?? [];
    expect(invokers.length).toBeGreaterThanOrEqual(4);
    const searchPaths =
      migration.match(/set\s+search_path\s*=\s*pg_catalog,\s*public/gi) ?? [];
    expect(searchPaths.length).toBeGreaterThanOrEqual(4);
  });

  it("explicitly locks new RPCs to service_role", () => {
    for (const fn of [
      "quote_assert_negotiation_v1",
      "quote_create_with_snapshot_v3_secure",
      "quote_append_snapshot_v3_secure",
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`);
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn}\\([\\s\\S]*?\\) to service_role;`,
          "i"
        )
      );
    }
  });

  it("keeps protected negotiation details out of browser Quote contracts", () => {
    expect(migration).not.toContain("create or replace function public.quote_list_secure");
    expect(publicContract).not.toContain("minimumAllowedTotal");
    expect(publicContract).not.toContain("minimum_allowed_total");
    expect(publicContract).not.toContain("negotiationPrivateSnapshot");
    expect(publicContract).not.toContain("negotiation_private_snapshot");
  });

  it("validates manager authority and explicit below-minimum override in SQL", () => {
    expect(migration).toContain("QUOTE_NEGOTIATION_FORBIDDEN");
    expect(migration).toContain("BELOW_MINIMUM_OVERRIDE_REQUIRED");
    expect(migration).toContain("BELOW_MINIMUM_OVERRIDE_NOT_APPLICABLE");
    expect(migration).toContain("v_role is distinct from 'gerente'");
    expect(migration).toContain(
      "v_expected_below_minimum and not v_below_minimum_override"
    );
  });
});
