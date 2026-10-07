import {
  quoteCurrentPublicResultSchema,
  quoteGetApiRequestSchema,
  quotePersistedSummarySchema,
  quoteSavePublicResultSchema,
  quoteSaveRequestSchema,
  quoteTransitionApiRequestSchema,
  quoteTransitionResultSchema,
  type QuoteCurrentPublicResult,
  type QuoteSavePublicResult,
  type QuoteTransitionResult,
} from "../../../shared/quotes/index.js";
import type {
  OfficialQuoteCalculationResult,
} from "./calculationService.js";

export interface OfficialQuotePersistenceCalculator {
  calculate(input: unknown): Promise<OfficialQuoteCalculationResult>;
}

export class QuotePersistenceServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "QUOTE_NOT_FOUND"
      | "QUOTE_REVISION_CONFLICT"
      | "QUOTE_STATE_CONFLICT"
      | "QUOTE_VERSION_CONFLICT"
      | "INVALID_QUOTE_CONFIGURATION"
      | "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR"
      | "QUOTE_PERSISTENCE_ERROR",
    message: string
  ) {
    super(message);
    this.name = "QuotePersistenceServiceError";
  }
}

export function mapQuotePersistenceError(error: any): never {
  const message = String(error?.message ?? "");
  const mappings: Array<
    [
      RegExp,
      number,
      QuotePersistenceServiceError["code"],
      string,
    ]
  > = [
    [/QUOTE_NOT_FOUND/, 404, "QUOTE_NOT_FOUND", "Quote not found."],
    [
      /QUOTE_REVISION_CONFLICT/,
      409,
      "QUOTE_REVISION_CONFLICT",
      "Quote changed since it was loaded.",
    ],
    [
      /QUOTE_STATE_CONFLICT/,
      409,
      "QUOTE_STATE_CONFLICT",
      "Quote lifecycle state conflict.",
    ],
    [
      /QUOTE_VERSION_CONFLICT/,
      409,
      "QUOTE_VERSION_CONFLICT",
      "Quote snapshot version conflict.",
    ],
    [
      /INVALID_QUOTE_CONFIGURATION/,
      400,
      "INVALID_QUOTE_CONFIGURATION",
      "Quote configuration is invalid.",
    ],
  ];
  for (const [pattern, status, code, safe] of mappings)
    if (pattern.test(message))
      throw new QuotePersistenceServiceError(status, code, safe);
  throw new QuotePersistenceServiceError(
    500,
    "QUOTE_PERSISTENCE_ERROR",
    "Quote persistence failed."
  );
}

const mapSummary = (dto: any) =>
  quotePersistedSummarySchema.safeParse({
    quoteId: dto?.quote_id,
    quoteNumber: dto?.quote_number,
    status: dto?.status,
    revision: dto?.revision,
    snapshotId: dto?.snapshot_id,
    snapshotVersion: dto?.snapshot_version,
    savedAt: dto?.saved_at,
  });

export class OfficialQuotePersistenceService {
  constructor(
    private readonly db: any,
    private readonly calculator: OfficialQuotePersistenceCalculator
  ) {}

  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) mapQuotePersistenceError(error);
    return data;
  }

  private snapshotArgs(
    calculation: OfficialQuoteCalculationResult,
    request: ReturnType<typeof quoteSaveRequestSchema.parse>,
    actorId: string
  ) {
    const pricing = calculation.pricing;
    return {
      p_actor_id: actorId,
      p_calculation_version: calculation.publicResult.calculationVersion,
      p_product_id: calculation.publicResult.productId,
      p_product_version_id: calculation.publicResult.productVersionId,
      p_product_version_number: calculation.publicResult.productVersionNumber,
      p_product_version_revision:
        calculation.publicResult.productVersionRevision,
      p_pricing_policy_id: pricing.pricingEngine.policyId,
      p_pricing_policy_version_id: pricing.pricingEngine.policyVersionId,
      p_pricing_policy_version_number:
        pricing.pricingEngine.policyVersionNumber,
      p_pricing_policy_version_revision:
        pricing.pricingEngine.policyVersionRevision,
      p_product_pricing_settings_revision:
        pricing.privateProvenance.productPricingSettingsRevision,
      p_payment_rate_source: pricing.privateProvenance.paymentRateSource,
      p_payment_term_revision:
        pricing.privateProvenance.paymentTermRevision,
      p_installation_settings_revision:
        calculation.installationSettingsRevision,
      p_costing_aggregation_version: pricing.costing.aggregationVersion,
      p_effective_cost_at: pricing.costing.effectiveCostAt,
      p_commercial_quantity: pricing.costing.commercialQuantity,
      p_installments: calculation.publicResult.installments,
      p_total_selling_price:
        calculation.publicResult.totalSellingPrice.amount,
      p_request_snapshot: {
        productVersionId: request.productVersionId,
        request: request.request,
        installments: request.installments,
        installation: request.installation,
        munck: request.munck,
      },
      p_public_result_snapshot: calculation.publicResult,
      p_private_snapshot: {
        costing: pricing.costing,
        pricingEngine: pricing.pricingEngine,
        commercial: pricing.commercial,
        pricingProvenance: pricing.privateProvenance,
        installationSettings: calculation.installationSettings,
      },
    };
  }

  async save(input: unknown, actorId: string): Promise<QuoteSavePublicResult> {
    const parsed = quoteSaveRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote save request is invalid."
      );

    const request = parsed.data;
    const calculation = await this.calculator.calculate({
      productVersionId: request.productVersionId,
      request: request.request,
      installments: request.installments,
      installation: request.installation,
      munck: request.munck,
    });
    const args = this.snapshotArgs(calculation, request, actorId);

    const data =
      request.quoteId === null
        ? await this.rpc("quote_create_with_snapshot_secure", args)
        : await this.rpc("quote_append_snapshot_secure", {
            p_quote_id: request.quoteId,
            p_expected_revision: request.expectedRevision,
            ...args,
          });

    const summary = mapSummary(data);
    if (!summary.success)
      throw new QuotePersistenceServiceError(
        500,
        "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
        "Persisted Quote is incompatible with this server."
      );

    return quoteSavePublicResultSchema.parse({
      ...summary.data,
      publicResult: calculation.publicResult,
    });
  }

  async load(input: unknown): Promise<QuoteCurrentPublicResult> {
    const parsed = quoteGetApiRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote load request is invalid."
      );

    const data = await this.rpc("quote_get_current_secure", {
      p_quote_id: parsed.data.quoteId,
    });
    if (!data)
      throw new QuotePersistenceServiceError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote not found."
      );

    const snapshot = data?.snapshot;
    const result = quoteCurrentPublicResultSchema.safeParse({
      quoteId: data?.quote?.id,
      quoteNumber: data?.quote?.quote_number,
      status: data?.quote?.status,
      revision: data?.quote?.revision,
      snapshotId: snapshot?.id,
      snapshotVersion: snapshot?.version_number,
      savedAt: snapshot?.created_at,
      request: snapshot?.request_snapshot,
      publicResult: snapshot?.public_result_snapshot,
    });
    if (!result.success)
      throw new QuotePersistenceServiceError(
        500,
        "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
        "Persisted Quote is incompatible with this server."
      );
    return result.data;
  }

  async transition(
    input: unknown,
    actorId: string
  ): Promise<QuoteTransitionResult> {
    const parsed = quoteTransitionApiRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote transition request is invalid."
      );

    const data = await this.rpc("quote_transition_status_secure", {
      p_quote_id: parsed.data.quoteId,
      p_expected_revision: parsed.data.expectedRevision,
      p_target_status: parsed.data.targetStatus,
      p_actor_id: actorId,
    });

    const result = quoteTransitionResultSchema.safeParse({
      quoteId: data?.quote_id,
      quoteNumber: data?.quote_number,
      status: data?.status,
      revision: data?.revision,
      snapshotId: data?.snapshot_id,
      updatedAt: data?.updated_at,
    });
    if (!result.success)
      throw new QuotePersistenceServiceError(
        500,
        "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
        "Persisted Quote is incompatible with this server."
      );
    return result.data;
  }
}
