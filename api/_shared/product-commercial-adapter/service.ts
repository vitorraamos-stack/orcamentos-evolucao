import {
  commercialPublishedContentSchema,
  publishedCommercialAdapterResultSchema,
  type PublishedCommercialAdapterResult,
} from "../../../shared/product-commercial-adapter/index.js";

export class PublishedCommercialAdapterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PublishedCommercialAdapterError";
  }
}

const unavailable = (): never => {
  throw new PublishedCommercialAdapterError(
    500, "COMMERCIAL_READ_UNAVAILABLE", "Published commercial data is unavailable."
  );
};

const publishedOnly = (item: unknown, kind: "field" | "complement" | "gallery") => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return true;
  const record = item as Record<string, unknown>;
  if (record.visibility === "internal") return false;
  if (kind === "field" || kind === "gallery")
    return record.visibility === undefined || record.visibility === "consultor";
  return (record.visibility === undefined || record.visibility === "commercial")
    && record.mode !== "internal";
};

/**
 * Defense-in-depth: re-project a publication with a positive list of commercial
 * fields. Never return private drafts, costing resources or engineering formulas.
 */
export function projectPublishedCommercialContent(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new PublishedCommercialAdapterError(
      500, "INVALID_PUBLICATION", "Published commercial data has an invalid format."
    );
  const content = raw as Record<string, unknown>;
  const candidate = {
    ...content,
    fields: Array.isArray(content.fields)
      ? content.fields.filter(item => publishedOnly(item, "field"))
      : content.fields,
    gallery: Array.isArray(content.gallery)
      ? content.gallery.filter(item => publishedOnly(item, "gallery"))
      : content.gallery,
    complements: Array.isArray(content.complements)
      ? content.complements.filter(item => publishedOnly(item, "complement"))
      : content.complements,
  };
  const parsed = commercialPublishedContentSchema.safeParse(candidate);
  if (!parsed.success)
    throw new PublishedCommercialAdapterError(
      500, "INVALID_PUBLICATION", "Published commercial data has an invalid format."
    );
  const visibleFieldIds = new Set(parsed.data.fields.map(item => item.id));
  return {
    ...parsed.data,
    rules: {
      ...parsed.data.rules,
      conditions: (parsed.data.rules.conditions ?? [])
        .filter(rule => visibleFieldIds.has(rule.field)),
    },
  };
}

export class PublishedCommercialAdapterService {
  constructor(private readonly db: any) {}

  async load(productId: string): Promise<PublishedCommercialAdapterResult> {
    // The canonical link, not a text match, selects the commercial publication.
    const link = await this.db.from("product_commercial_links")
      .select("product_id,library_product_id")
      .eq("product_id", productId)
      .maybeSingle();
    if (link.error) unavailable();
    if (!link.data)
      throw new PublishedCommercialAdapterError(
        404, "PRODUCT_NOT_LINKED", "This product does not have a commercial link."
      );

    const libraryProductId: string = link.data.library_product_id;
    const [product, library, published, engineering] = await Promise.all([
      this.db.from("products").select("id,status")
        .eq("id", productId).maybeSingle(),
      this.db.from("library_products").select("id,status")
        .eq("id", libraryProductId).maybeSingle(),
      this.db.from("library_publications")
        .select("product_id,version,content,published_at")
        .eq("product_id", libraryProductId).maybeSingle(),
      this.db.from("product_versions")
        .select("id,version_number,status")
        .eq("product_id", productId)
        .eq("status", "PUBLISHED")
        .order("version_number", { ascending: false })
        .limit(1).maybeSingle(),
    ]);
    if ([product, library, published, engineering].some(item => item.error))
      unavailable();
    if (product.data?.status !== "ACTIVE" ||
        library.data?.status !== "published" || !published.data)
      throw new PublishedCommercialAdapterError(
        404, "PUBLICATION_UNAVAILABLE", "Published commercial product is unavailable."
      );

    const commercial = projectPublishedCommercialContent(published.data.content);
    const result = publishedCommercialAdapterResultSchema.safeParse({
      ...commercial,
      productId,
      libraryProductId,
      commercialVersion: published.data.version,
      commercialPublishedAt: published.data.published_at,
      engineeringVersion: engineering.data
        ? { id: engineering.data.id, number: engineering.data.version_number }
        : null,
      mappingStatus: engineering.data
        ? "NOT_ASSESSED" : "ENGINEERING_UNAVAILABLE",
      pricingStatus: "NOT_CHECKED",
    });
    if (!result.success)
      throw new PublishedCommercialAdapterError(
        500, "INVALID_PUBLICATION", "Published commercial data has an invalid format."
      );
    return result.data;
  }
}
