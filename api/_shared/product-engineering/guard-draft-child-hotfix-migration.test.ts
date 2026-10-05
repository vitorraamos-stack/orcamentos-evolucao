import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261005115615_product_engineering_guard_draft_child_hotfix.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("product engineering draft-child guard hotfix migration", () => {
  it("replaces only the invoker trigger function and locks its parent version", () => {
    expect(sql).toMatch(
      /create or replace function\s+public\.product_engineering_guard_draft_child\(\)/
    );
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = pg_catalog, public");
    expect(sql).toMatch(
      /select status[\s\S]*?from public\.product_versions[\s\S]*?where id = target_version_id[\s\S]*?for update/
    );
  });

  it("keeps missing-parent, DRAFT-only, and immutable-version protections", () => {
    expect(sql).toMatch(/if not found then[\s\S]*?parent product version does not exist/);
    expect(sql).toMatch(
      /if parent_status <> 'draft' then[\s\S]*?mutable only in draft/
    );
    expect(sql).toMatch(
      /if tg_op = 'update' and new\.product_version_id is distinct from old\.product_version_id then[\s\S]*?cannot move between versions/
    );
  });

  it("checks the shared key namespace only inside input and variable branches", () => {
    const namespaceGuard = sql.match(
      /if tg_op <> 'delete' then([\s\S]*?)\n\s*end if;\n\n\s*if tg_op = 'delete'/
    )?.[1];

    expect(namespaceGuard).toBeDefined();
    expect(namespaceGuard).toMatch(
      /if tg_table_name = 'product_inputs' then[\s\S]*?from public\.product_variables[\s\S]*?key = new\.key[\s\S]*?elsif tg_table_name = 'product_variables' then[\s\S]*?from public\.product_inputs[\s\S]*?key = new\.key/
    );
    expect(namespaceGuard?.match(/new\.key/g)).toHaveLength(2);
    expect(namespaceGuard).not.toContain("product_components");
    expect(sql).not.toMatch(/tg_table_name\s*=.*\band\s+exists/);
  });
});
