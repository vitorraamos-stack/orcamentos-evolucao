import {
  PRICING_ENGINE_VERSION,
  PRICING_SCHEMA_VERSION,
  pricingCreatePolicyResultSchema,
  pricingCreateVersionResultSchema,
  pricingPaymentTermSchema,
  pricingPolicyAdminSchema,
  pricingPolicySchema,
  pricingPolicyVersionDefinitionSchema,
  pricingPolicyVersionSchema,
  pricingRevisionResultSchema,
  pricingMarkupSchema,
  productPricingSettingsSchema,
} from "../../../shared/pricing/index.js";

export class PricingPersistenceCompatibilityError extends Error {
  constructor(
    readonly code:
      | "PRICING_PERSISTENCE_COMPATIBILITY_ERROR"
      | "UNSUPPORTED_PRICING_SCHEMA_VERSION"
      | "UNSUPPORTED_PRICING_ENGINE_VERSION",
    message = "Pricing persistence returned an incompatible payload."
  ) {
    super(message);
    this.name = "PricingPersistenceCompatibilityError";
  }
}

const incompatible = (): never => {
  throw new PricingPersistenceCompatibilityError(
    "PRICING_PERSISTENCE_COMPATIBILITY_ERROR"
  );
};

const decimalText = (value: unknown, field: string) => {
  if (typeof value !== "string")
    throw new PricingPersistenceCompatibilityError(
      "PRICING_PERSISTENCE_COMPATIBILITY_ERROR",
      `${field} must be persisted as decimal text`
    );
  const parsed = pricingMarkupSchema.safeParse(value);
  if (!parsed.success) return incompatible();
  return parsed.data;
};

export const mapPricingPolicyRow = (row: any) => {
  const parsed = pricingPolicyAdminSchema.safeParse({
    id: row?.id,
    code: row?.code,
    name: row?.name,
    description: row?.description,
    status: row?.status,
    revision: row?.revision,
    createdAt: row?.created_at,
    createdBy: row?.created_by,
    updatedAt: row?.updated_at,
    updatedBy: row?.updated_by,
  });
  if (!parsed.success) return incompatible();
  return parsed.data;
};

export const mapPricingPolicyVersionRow = (row: any) => {
  const parsed = pricingPolicyVersionSchema.safeParse({
    id: row?.id,
    pricingPolicyId: row?.pricing_policy_id,
    versionNumber: row?.version_number,
    revision: row?.revision,
    status: row?.status,
    notes: row?.notes,
    createdAt: row?.created_at,
    createdBy: row?.created_by,
    publishedAt: row?.published_at,
    publishedBy: row?.published_by,
  });
  if (!parsed.success) return incompatible();
  return parsed.data;
};

export function mapPricingAggregate(dto: any) {
  if (dto?.schema_version !== PRICING_SCHEMA_VERSION)
    throw new PricingPersistenceCompatibilityError(
      "UNSUPPORTED_PRICING_SCHEMA_VERSION",
      "Unsupported persisted Pricing schema version."
    );
  if (dto?.engine_version !== PRICING_ENGINE_VERSION)
    throw new PricingPersistenceCompatibilityError(
      "UNSUPPORTED_PRICING_ENGINE_VERSION",
      "Unsupported persisted Pricing engine version."
    );
  if (dto?.strategy_type !== "MARKUP_ON_COST" || dto?.markup_base !== "TOTAL_COST")
    return incompatible();
  if (dto?.charges !== undefined && (!Array.isArray(dto.charges) || dto.charges.length !== 0))
    return incompatible();

  const policyResult = pricingPolicySchema.safeParse({
    id: dto?.policy?.id,
    code: dto?.policy?.code,
    name: dto?.policy?.name,
    description: dto?.policy?.description,
    status: dto?.policy?.status,
  });
  if (!policyResult.success) return incompatible();

  const version = mapPricingPolicyVersionRow(dto?.version);
  if (version.pricingPolicyId !== policyResult.data.id) return incompatible();
  const markup = decimalText(dto?.markup, "markup");

  const definitionResult = pricingPolicyVersionDefinitionSchema.safeParse({
    schemaVersion: dto.schema_version,
    version,
    strategy: {
      type: "MARKUP_ON_COST",
      markup,
      markupBase: "TOTAL_COST",
    },
    charges: [],
  });
  if (!definitionResult.success) return incompatible();

  return { policy: policyResult.data, definition: definitionResult.data };
}

export const mapProductPricingSettings = (row: any) => {
  if (typeof row?.minimum_selling_price !== "string")
    throw new PricingPersistenceCompatibilityError(
      "PRICING_PERSISTENCE_COMPATIBILITY_ERROR",
      "minimum_selling_price must be persisted as decimal text"
    );
  const parsed = productPricingSettingsSchema.safeParse({
    productId: row?.product_id,
    pricingPolicyId: row?.pricing_policy_id,
    minimumSellingPrice: row?.minimum_selling_price,
    revision: row?.revision,
    updatedAt: row?.updated_at,
    updatedBy: row?.updated_by,
  });
  if (!parsed.success) return incompatible();
  return parsed.data;
};

export const mapPricingPaymentTerm = (row: any) => {
  if (typeof row?.rate !== "string")
    throw new PricingPersistenceCompatibilityError(
      "PRICING_PERSISTENCE_COMPATIBILITY_ERROR",
      "rate must be persisted as decimal text"
    );
  const parsed = pricingPaymentTermSchema.safeParse({
    installments: row?.installments,
    rate: row?.rate,
    revision: row?.revision,
    updatedAt: row?.updated_at,
    updatedBy: row?.updated_by,
  });
  if (!parsed.success) return incompatible();
  return parsed.data;
};

export const mapCreatePricingPolicyResult = (row: any) =>
  pricingCreatePolicyResultSchema.parse({
    policyId: row?.policy_id,
    versionId: row?.version_id,
    policyRevision: row?.policy_revision,
    versionRevision: row?.version_revision,
  });

export const mapCreatePricingVersionResult = (row: any) =>
  pricingCreateVersionResultSchema.parse({
    pricingPolicyId: row?.pricing_policy_id,
    sourceVersionId: row?.source_version_id,
    versionId: row?.version_id,
    versionNumber: row?.version_number,
    revision: row?.revision,
  });

export const mapPricingRevisionResult = (value: any) =>
  pricingRevisionResultSchema.parse({ revision: value?.revision ?? value });
