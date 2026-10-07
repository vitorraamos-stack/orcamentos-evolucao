import {
  quoteCurrentPublicResultSchema,
  quoteGetApiRequestSchema,
  quoteListApiRequestSchema,
  quoteListResultSchema,
  quotePersistedSummarySchema,
  quoteSavePublicResultSchema,
  quoteSaveRequestSchema,
  quoteTransitionApiRequestSchema,
  quoteTransitionResultSchema,
  type QuoteCurrentPublicResult,
  type QuoteListResult,
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
      | "QUOTE_FORBIDDEN"
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

const commercialFromDto = (dto: any) => ({
  customerName: dto?.customer_name,
  customerPhone: dto?.customer_phone ?? null,
  title: dto?.title,
});

const mapSummary = (dto: any) =>
  quotePersistedSummarySchema.safeParse({
    quoteId: dto?.quote_id,
    quoteNumber: dto?.quote_number,
    status: dto?.status,
    revision: dto?.revision,
    snapshotId: dto?.snapshot_id,
    snapshotVersion: dto?.snapshot_version,
    savedAt: dto?.saved_at,
    commercial: commercialFromDto(dto),
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

  private assertOwnerAccess(
    data: any,
    actorId: string,
    isManager: boolean
  ) {
    if (!data)
      throw new QuotePersistenceServiceError(
        404,
        "QUOTE_NOT_FOUND",
        "Quote not found."
      );
    if (!isManager && data?.quote?.created_by !== actorId)
      throw new QuotePersistenceServiceError(
        403,
        "QUOTE_FORBIDDEN",
        "Quote access is not authorized."
      );
  }

  private async loadAuthorizedRaw(
    quoteId: string,
    actorId: string,
    isManager: boolean
  ) {
    const data = await this.rpc("quote_get_current_secure", {
      p_quote_id: quoteId,
    });
    this.assertOwnerAccess(data, actorId, isManager);
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
      p_customer_name: request.commercial.customerName,
      p_customer_phone: request.commercial.customerPhone,
      p_title: request.commercial.title,
      p_commercial_snapshot: request.commercial,
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

  async save(
    input: unknown,
    actorId: string,
    isManager = false
  ): Promise<QuoteSavePublicResult> {
    const parsed = quoteSaveRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote save request is invalid."
      );

    const request = parsed.data;
    if (request.quoteId !== null)
      await this.loadAuthorizedRaw(request.quoteId, actorId, isManager);

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
        ? await this.rpc("quote_create_with_snapshot_v2_secure", args)
        : await this.rpc("quote_append_snapshot_v2_secure", {
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

  async load(
    input: unknown,
    actorId: string,
    isManager = false
  ): Promise<QuoteCurrentPublicResult> {
    const parsed = quoteGetApiRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote load request is invalid."
      );

    const data = await this.loadAuthorizedRaw(
      parsed.data.quoteId,
      actorId,
      isManager
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
      commercial: commercialFromDto(data?.quote),
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

  async list(
    input: unknown,
    actorId: string,
    isManager = false
  ): Promise<QuoteListResult> {
    const parsed = quoteListApiRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote list request is invalid."
      );

    const { page, pageSize, search, status } = parsed.data;
    const data = await this.rpc("quote_list_secure", {
      p_actor_id: actorId,
      p_is_manager: isManager,
      p_search: search,
      p_status: status,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });

    const result = quoteListResultSchema.safeParse({
      items: (data?.items ?? []).map((item: any) => ({
        quoteId: item?.quote_id,
        quoteNumber: item?.quote_number,
        status: item?.status,
        revision: item?.revision,
        commercial: commercialFromDto(item),
        snapshotVersion: item?.snapshot_version,
        totalSellingPrice: {
          currency: "BRL",
          amount: item?.total_selling_price,
        },
        installments: item?.installments,
        productId: item?.product_id,
        productName: item?.product_name,
        createdAt: item?.created_at,
        updatedAt: item?.updated_at,
        createdBy: item?.created_by,
        createdByEmail: item?.created_by_email ?? null,
      })),
      total: data?.total ?? 0,
      page,
      pageSize,
    });
    if (!result.success)
      throw new QuotePersistenceServiceError(
        500,
        "QUOTE_PERSISTENCE_COMPATIBILITY_ERROR",
        "Persisted Quote list is incompatible with this server."
      );
    return result.data;
  }

  async transition(
    input: unknown,
    actorId: string,
    isManager = false
  ): Promise<QuoteTransitionResult> {
    const parsed = quoteTransitionApiRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new QuotePersistenceServiceError(
        400,
        "INVALID_QUOTE_CONFIGURATION",
        "Quote transition request is invalid."
      );

    await this.loadAuthorizedRaw(parsed.data.quoteId, actorId, isManager);

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
