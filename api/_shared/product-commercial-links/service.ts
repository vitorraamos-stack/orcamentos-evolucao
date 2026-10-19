import {
  productCommercialLinkSchema,
  type ProductCommercialLink,
} from "../../../shared/product-commercial-links/index.js";

const TABLE = "product_commercial_links";
const COLUMNS = "product_id,library_product_id,created_at,created_by";

export class ProductCommercialLinkServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ProductCommercialLinkServiceError";
  }
}

function mapRow(row: any): ProductCommercialLink {
  const parsed = productCommercialLinkSchema.safeParse({
    productId: row?.product_id,
    libraryProductId: row?.library_product_id,
    createdAt: row?.created_at,
    createdBy: row?.created_by,
  });
  if (!parsed.success)
    throw new ProductCommercialLinkServiceError(
      500, "INCOMPATIBLE_LINK_DATA", "Link data is incompatible."
    );
  return parsed.data;
}

const persistenceError = (): never => {
  throw new ProductCommercialLinkServiceError(
    500, "LINK_PERSISTENCE_ERROR", "Product link storage is unavailable."
  );
};

export class ProductCommercialLinkService {
  constructor(private readonly db: any) {}

  private async findMatches(
    productId: string,
    libraryProductId: string
  ): Promise<ProductCommercialLink[]> {
    // UUIDs are validated at the API boundary, not interpolated from free text.
    const { data, error } = await this.db.from(TABLE)
      .select(COLUMNS)
      .or("product_id.eq." + productId + ",library_product_id.eq." + libraryProductId)
      .limit(2);
    if (error) persistenceError();
    return (data ?? []).map(mapRow);
  }

  private resolveMatches(
    matches: ProductCommercialLink[],
    productId: string,
    libraryProductId: string
  ): { created: false; link: ProductCommercialLink } | null {
    if (!matches.length) return null;
    const exact = matches.find(link =>
      link.productId === productId && link.libraryProductId === libraryProductId
    );
    if (exact && matches.length === 1) return { created: false, link: exact };
    throw new ProductCommercialLinkServiceError(
      409, "LINK_CONFLICT", "One of these products is linked to another record."
    );
  }

  async list(productId?: string): Promise<ProductCommercialLink[]> {
    let query = this.db.from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) persistenceError();
    return (data ?? []).map(mapRow);
  }

  async create(
    productId: string,
    libraryProductId: string,
    actorId: string
  ): Promise<{ created: boolean; link: ProductCommercialLink }> {
    // Repetition is idempotent, but reassociation is never automatic.
    const existing = this.resolveMatches(
      await this.findMatches(productId, libraryProductId),
      productId, libraryProductId
    );
    if (existing) return existing;

    const [product, commercial] = await Promise.all([
      this.db.from("products").select("id,status").eq("id", productId).maybeSingle(),
      this.db.from("library_products").select("id,status").eq("id", libraryProductId).maybeSingle(),
    ]);
    if (product.error || commercial.error) persistenceError();
    if (!product.data || !commercial.data)
      throw new ProductCommercialLinkServiceError(
        404, "PRODUCT_NOT_FOUND", "One of the products does not exist."
      );
    if (product.data.status !== "ACTIVE" || commercial.data.status === "archived")
      throw new ProductCommercialLinkServiceError(
        409, "PRODUCT_NOT_LINKABLE", "An inactive or archived product cannot be linked."
      );

    const { data, error } = await this.db.from(TABLE)
      .insert({
        product_id: productId,
        library_product_id: libraryProductId,
        created_by: actorId,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        // Close the race between simultaneous administrators without overwriting.
        const raced = this.resolveMatches(
          await this.findMatches(productId, libraryProductId),
          productId, libraryProductId
        );
        if (raced) return raced;
        throw new ProductCommercialLinkServiceError(
          409, "LINK_CONFLICT", "One of these products was linked concurrently."
        );
      }
      if (error.code === "23503")
        throw new ProductCommercialLinkServiceError(
          409, "PRODUCT_CHANGED", "A referenced product changed; reload and retry."
        );
      persistenceError();
    }
    return { created: true, link: mapRow(data) };
  }
}
