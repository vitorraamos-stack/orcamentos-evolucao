import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../supabase/migrations/20261005150129_costing_persistence_foundation.sql",
    import.meta.url
  )
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

const definitions = [
  "material_definitions",
  "process_definitions",
  "outsourced_service_definitions",
  "fixed_cost_definitions",
] as const;
const rates = [
  ["material_cost_rates", "material_id", "material_definitions"],
  ["process_cost_rates", "process_definition_id", "process_definitions"],
  [
    "outsourced_service_cost_rates",
    "outsourced_service_id",
    "outsourced_service_definitions",
  ],
  ["fixed_cost_rates", "fixed_cost_definition_id", "fixed_cost_definitions"],
] as const;

describe("costing persistence migration", () => {
  it("creates all resource definitions with the closed CostableUnit set", () => {
    for (const table of definitions) {
      expect(normalized).toContain(`create table public.${table}`);
      expect(normalized).toContain(
        `constraint ${table}_id_cost_unit_unique unique (id, cost_unit)`
      );
      const unitConstraint = `constraint ${table}_cost_unit_valid check (cost_unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h'))`;
      expect(normalized).toContain(unitConstraint);
      expect(unitConstraint).not.toContain("brl");
    }
  });

  it("creates constrained numeric temporal rates and composite resource FKs", () => {
    for (const [table, resourceColumn, definition] of rates) {
      expect(normalized).toContain(`create table public.${table}`);
      expect(normalized).toMatch(
        new RegExp(
          `create table public\\.${table} \\([^;]*amount numeric not null`
        )
      );
      expect(normalized).toContain(
        `constraint ${table}_amount_nonnegative check (amount >= 0)`
      );
      expect(normalized).toContain(
        `constraint ${table}_currency_brl check (currency = 'brl')`
      );
      expect(normalized).toContain(
        `constraint ${table}_interval_valid check (effective_to is null or effective_to > effective_from)`
      );
      expect(normalized).toContain(
        `foreign key (${resourceColumn}, unit) references public.${definition}(id, cost_unit) on delete restrict`
      );
      expect(normalized).toContain(
        `on public.${table}(${resourceColumn}) where effective_to is null`
      );
    }
  });

  it("serializes overlap checks per resource and uses half-open ranges", () => {
    expect(normalized.match(/for update/g)).toHaveLength(4);
    expect(normalized.match(/tstzrange\(/g)).toHaveLength(8);
    expect(normalized.match(/'\[\)'/g)).toHaveLength(8);
    expect(normalized.match(/ && /g)).toHaveLength(4);
    expect(normalized).not.toContain("btree_gist");
    for (const [table] of rates) {
      expect(normalized).toContain(
        `create trigger ${table}_guard before insert or update`
      );
    }
  });

  it("makes historical rates immutable except for the first close", () => {
    for (const field of [
      "new.id is distinct from old.id",
      "new.amount is distinct from old.amount",
      "new.currency is distinct from old.currency",
      "new.unit is distinct from old.unit",
      "new.effective_from is distinct from old.effective_from",
      "new.created_at is distinct from old.created_at",
      "new.created_by is distinct from old.created_by",
    ]) {
      expect(
        normalized.match(new RegExp(field.replaceAll(".", "\\."), "g"))
      ).toHaveLength(4);
    }
    expect(
      normalized.match(
        /old\.effective_to is null and new\.effective_to is not null/g
      )
    ).toHaveLength(4);
    expect(normalized.match(/costing_prevent_rate_delete\(\)/g)).toHaveLength(
      6
    );
    expect(
      normalized.match(/costing_prevent_resource_delete\(\)/g)
    ).toHaveLength(6);
  });

  it("enables RLS, blocks browser roles, and grants only server-side writes", () => {
    for (const table of [...definitions, ...rates.map(([table]) => table)]) {
      expect(normalized).toContain(
        `alter table public.${table} enable row level security`
      );
    }
    expect(normalized).toContain("from public, anon, authenticated");
    expect(normalized).toContain("to service_role");
    expect(normalized).toContain("grant select, insert, update on table");
    expect(normalized).not.toMatch(/grant[^;]*delete[^;]*service_role/);
    expect(normalized.match(/security invoker/g)).toHaveLength(7);
    expect(normalized).not.toContain("security definer");
  });

  it("binds Product Engineering only to the new Costing catalogues", () => {
    for (const [, resourceColumn, definition] of rates) {
      expect(normalized).toContain(
        `foreign key (${resourceColumn}) references public.${definition}(id) on delete restrict`
      );
      expect(normalized).toContain(
        `on public.product_components(${resourceColumn}) where ${resourceColumn} is not null`
      );
    }
    expect(normalized).not.toContain("references public.materials");
    expect(normalized).not.toMatch(
      /(?:alter|drop|truncate|insert into|update|delete from) (?:table )?public\.(?:materials|price_tiers)\b/
    );
  });
});
