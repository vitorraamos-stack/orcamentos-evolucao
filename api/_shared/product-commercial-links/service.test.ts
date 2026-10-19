import { describe, expect, it, vi } from "vitest";
import { ProductCommercialLinkService } from "./service";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const LIBRARY = "10000000-0000-4000-8000-000000000002";
const OTHER = "10000000-0000-4000-8000-000000000003";
const ACTOR = "10000000-0000-4000-8000-000000000004";
const row = (product_id = PRODUCT, library_product_id = LIBRARY) => ({
  product_id, library_product_id,
  created_at: "2026-10-19T12:00:00Z", created_by: ACTOR,
});

function setup(opts: {
  records?: ReturnType<typeof row>[];
  productStatus?: string;
  commercialStatus?: string;
  missingProduct?: boolean;
  insertError?: { code: string };
} = {}) {
  const records = [...(opts.records ?? [])];
  const insert = vi.fn((value: any) => ({
    select: () => ({
      single: async () => {
        if (opts.insertError) return { data: null, error: opts.insertError };
        const created = row(value.product_id, value.library_product_id);
        records.push(created);
        return { data: created, error: null };
      },
    }),
  }));
  const from = vi.fn((table: string) => {
    if (table === "product_commercial_links") {
      return {
        select: () => ({
          or: () => ({
            limit: async () => ({
              data: records.filter(record =>
                record.product_id === PRODUCT || record.library_product_id === LIBRARY
              ), error: null,
            }),
          }),
        }),
        insert,
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            error: null,
            data: table === "products"
              ? (opts.missingProduct ? null : { id: PRODUCT, status: opts.productStatus ?? "ACTIVE" })
              : { id: LIBRARY, status: opts.commercialStatus ?? "published" },
          }),
        }),
      }),
    };
  });
  return { service: new ProductCommercialLinkService({ from }), insert, records };
}

describe("product commercial link service", () => {
  it("creates exactly one link with the server-derived actor", async () => {
    const { service, insert } = setup();
    const result = await service.create(PRODUCT, LIBRARY, ACTOR);
    expect(result).toMatchObject({
      created: true, link: { productId: PRODUCT, libraryProductId: LIBRARY },
    });
    expect(insert).toHaveBeenCalledWith({
      product_id: PRODUCT, library_product_id: LIBRARY, created_by: ACTOR,
    });
  });

  it("returns the existing exact link without writing", async () => {
    const { service, insert } = setup({ records: [row()] });
    const result = await service.create(PRODUCT, LIBRARY, ACTOR);
    expect(result.created).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an already linked engineering product", async () => {
    const { service, insert } = setup({ records: [row(PRODUCT, OTHER)] });
    await expect(service.create(PRODUCT, LIBRARY, ACTOR)).rejects.toMatchObject({
      status: 409, code: "LINK_CONFLICT",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an already linked commercial product", async () => {
    const { service, insert } = setup({ records: [row(OTHER, LIBRARY)] });
    await expect(service.create(PRODUCT, LIBRARY, ACTOR)).rejects.toMatchObject({
      status: 409, code: "LINK_CONFLICT",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects missing, inactive or archived source records", async () => {
    for (const opts of [
      { missingProduct: true }, { productStatus: "INACTIVE" },
      { commercialStatus: "archived" },
    ]) {
      const { service, insert } = setup(opts);
      await expect(service.create(PRODUCT, LIBRARY, ACTOR)).rejects.toMatchObject({
        status: opts.missingProduct ? 404 : 409,
      });
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it("never replaces an existing link on a unique violation", async () => {
    const { service, insert } = setup({ insertError: { code: "23505" } });
    await expect(service.create(PRODUCT, LIBRARY, ACTOR)).rejects.toMatchObject({
      status: 409, code: "LINK_CONFLICT",
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
