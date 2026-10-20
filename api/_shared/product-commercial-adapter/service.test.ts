import { describe, expect, it, vi } from "vitest";
import {
  projectPublishedCommercialContent,
  PublishedCommercialAdapterService,
} from "./service";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const LIBRARY = "10000000-0000-4000-8000-000000000002";
const VERSION = "10000000-0000-4000-8000-000000000003";
const publication = {
  name: "Letreiro em PVC Expandido",
  category: "Letras e letreiros",
  description: "Produto publicado",
  applications: "Fachadas",
  fields: [
    { id: "espessura", label: "Espessura", type: "select",
      required: true, when: "always", options: ["10 mm"], help: null, unit: null },
    { id: "segredo", label: "Custo interno", type: "text",
      required: false, when: "always", visibility: "internal" },
  ],
  gallery: [
    { id: "foto", title: "Exemplo", url: "https://example.com/a.png",
      caption: "", kind: "application", cover: true },
    { id: "interno", title: "Interna", url: "https://example.com/b.png",
      caption: "", kind: "detail", visibility: "internal" },
  ],
  complements: [
    { id: "arte", name: "Arte", mode: "separate", when: "always" },
    { id: "interno", name: "Custo", mode: "internal", when: "always", visibility: "internal" },
  ],
  guidance: "Orientações comerciais",
  internal_guidance: "NUNCA EXIBIR",
  totalCost: "999999",
  rules: {
    photos_policy: "recommend",
    special_fixing_review: true,
    conditions: [
      { id: "r1", field: "espessura", equals: "10 mm", action: "note", message: "OK" },
      { id: "r2", field: "segredo", equals: "x", action: "note", message: "Interna" },
    ],
  },
};

function mockDb(opts: {
  linked?: boolean;
  libraryStatus?: string;
  published?: boolean;
  engineering?: boolean;
  databaseError?: boolean;
} = {}) {
  const calls: string[] = [];
  const db = {
    from: (table: string) => {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (opts.databaseError) return { data: null, error: { message: "failure" } };
          const records: Record<string, unknown> = {
            product_commercial_links: opts.linked === false
              ? null : { product_id: PRODUCT, library_product_id: LIBRARY },
            products: { id: PRODUCT, status: "ACTIVE" },
            library_products: { id: LIBRARY, status: opts.libraryStatus ?? "published" },
            library_publications: opts.published === false
              ? null : { product_id: LIBRARY, version: 2,
                content: publication, published_at: "2026-10-20T11:00:00Z" },
            product_versions: opts.engineering === false
              ? null : { id: VERSION, version_number: 3, status: "PUBLISHED" },
          };
          return { data: records[table], error: null };
        },
      };
      return query;
    },
  };
  return { service: new PublishedCommercialAdapterService(db), calls };
}

describe("published commercial adapter 31B", () => {
  it("projects only public fields and strips unknown/private attributes", () => {
    const value = projectPublishedCommercialContent(publication);
    const output = JSON.stringify(value);
    expect(output).not.toContain("NUNCA EXIBIR");
    expect(output).not.toContain("999999");
    expect(output).not.toContain("Custo interno");
    expect(output).not.toContain("Interna");
    expect(value.fields).toHaveLength(1);
    expect(value.gallery).toHaveLength(1);
    expect(value.complements).toHaveLength(1);
    expect(value.rules.conditions).toHaveLength(1);
  });

  it("returns current publication with published engineering metadata only", async () => {
    const { service, calls } = mockDb();
    const result = await service.load(PRODUCT);
    expect(result).toMatchObject({
      productId: PRODUCT, libraryProductId: LIBRARY,
      commercialVersion: 2, name: "Letreiro em PVC Expandido",
      engineeringVersion: { id: VERSION, number: 3 },
      mappingStatus: "NOT_ASSESSED", pricingStatus: "NOT_CHECKED",
    });
    expect(JSON.stringify(result)).not.toContain("internal_guidance");
    expect(calls).not.toContain("library_product_history");
    expect(calls).not.toContain("product_components");
    expect(calls).not.toContain("costing_configuration_audit_events");
  });

  it("returns a commercial preparation even without published engineering", async () => {
    const { service } = mockDb({ engineering: false });
    const result = await service.load(PRODUCT);
    expect(result.engineeringVersion).toBeNull();
    expect(result.mappingStatus).toBe("ENGINEERING_UNAVAILABLE");
    expect(result.pricingStatus).toBe("NOT_CHECKED");
  });

  it("does not silently attach products without a canonical link", async () => {
    const { service, calls } = mockDb({ linked: false });
    await expect(service.load(PRODUCT)).rejects.toMatchObject({
      status: 404, code: "PRODUCT_NOT_LINKED",
    });
    expect(calls).toEqual(["product_commercial_links"]);
  });

  it("refuses archived commercial records or absent publications", async () => {
    for (const opts of [{ libraryStatus: "archived" }, { published: false }]) {
      const { service } = mockDb(opts);
      await expect(service.load(PRODUCT)).rejects.toMatchObject({
        status: 404, code: "PUBLICATION_UNAVAILABLE",
      });
    }
  });

  it("fails closed on untrusted publication structure and database failure", async () => {
    expect(() => projectPublishedCommercialContent({
      ...publication, rules: { photos_policy: "unexpected" },
    })).toThrow();
    const { service } = mockDb({ databaseError: true });
    await expect(service.load(PRODUCT)).rejects.toMatchObject({
      status: 500, code: "COMMERCIAL_READ_UNAVAILABLE",
    });
  });
});
