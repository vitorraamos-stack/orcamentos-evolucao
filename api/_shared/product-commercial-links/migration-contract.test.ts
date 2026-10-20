import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { productCommercialLinkCreateSchema } from "../../../shared/product-commercial-links/index";

const sql = readFileSync(
  "supabase/migrations/20261020111643_product_commercial_links_31a.sql", "utf8"
);

describe("PR 31A non-invasive link foundation", () => {
  it("keeps a 1:1 relationship with restrictive foreign keys", () => {
    expect(sql).toMatch(/product_id uuid primary key/);
    expect(sql).toMatch(/library_product_id uuid not null unique/);
    expect(sql.match(/on delete restrict/g)).toHaveLength(3);
  });
  it("denies browser direct grants and enables RLS without permissive policies", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/revoke all on table public\.product_commercial_links from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert on table public\.product_commercial_links to service_role/i);
    expect(sql).toMatch(/grant select \(id, status\) on table public\.library_products to service_role/i);
    expect(sql).not.toMatch(/grant select \*? on table public\.library_products to service_role/i);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("does not insert product links or modify existing catalog data", () => {
    expect(sql).not.toMatch(/insert into public\.product_commercial_links/i);
    expect(sql).not.toMatch(/update public\.(products|library_products)/i);
    expect(sql).not.toMatch(/delete from public\.(products|library_products)/i);
  });
  it("rejects untrusted createdBy/status fields on the API", () => {
    expect(productCommercialLinkCreateSchema.safeParse({
      action: "LINK_PRODUCT",
      productId: "10000000-0000-4000-8000-000000000001",
      libraryProductId: "10000000-0000-4000-8000-000000000002",
      createdBy: "10000000-0000-4000-8000-000000000003",
    }).success).toBe(false);
  });
});
