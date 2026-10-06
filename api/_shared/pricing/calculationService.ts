import {
  calculateCommercialPricing,
  calculatePricing,
  OFFICIAL_PRICING_CALCULATION_VERSION,
  officialPricingPublicResultSchema,
  officialPricingRequestSchema,
  type CommercialPricingResult,
  type OfficialPricingPublicResult,
  type OfficialPricingRequest,
  type PricingEngineResult,
} from "../../../shared/pricing/index.js";
import type {
  CostingAggregateResult,
  OfficialCostingRequest,
} from "../../../shared/costing/index.js";
import type { OfficialPricingContext } from "./calculationContext.js";

export interface OfficialCostingCalculator {
  calculate(input: OfficialCostingRequest): Promise<CostingAggregateResult>;
}

export interface OfficialPricingContextLoader {
  loadOfficialCalculationContext(
    productId: string,
    installments: number
  ): Promise<OfficialPricingContext>;
}

export class OfficialPricingCalculationError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "INVALID_OFFICIAL_PRICING_REQUEST"
      | "INVALID_OFFICIAL_PRICING_CONTEXT"
      | "INVALID_OFFICIAL_PRICING_RESULT",
    message: string
  ) {
    super(message);
    this.name = "OfficialPricingCalculationError";
  }
}

export interface OfficialPricingCalculationResult {
  readonly publicResult: OfficialPricingPublicResult;
  readonly costing: CostingAggregateResult;
  readonly pricingEngine: PricingEngineResult;
  readonly commercial: CommercialPricingResult;
  readonly privateProvenance: {
    readonly productPricingSettingsRevision: number;
    readonly paymentRateSource: OfficialPricingContext["payment"]["source"];
    readonly paymentTermRevision: number | null;
  };
}

export class OfficialPricingCalculationService {
  constructor(
    private readonly costing: OfficialCostingCalculator,
    private readonly pricing: OfficialPricingContextLoader
  ) {}

  async calculate(input: unknown): Promise<OfficialPricingCalculationResult> {
    const parsed = officialPricingRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new OfficialPricingCalculationError(
        400,
        "INVALID_OFFICIAL_PRICING_REQUEST",
        "Invalid official Pricing request."
      );

    const request: OfficialPricingRequest = parsed.data;
    const costing = await this.costing.calculate({
      productVersionId: request.productVersionId,
      request: request.request,
    });

    const context = await this.pricing.loadOfficialCalculationContext(
      costing.productId,
      request.installments
    );

    if (
      context.productSettings.productId !== costing.productId ||
      context.payment.installments !== request.installments
    )
      throw new OfficialPricingCalculationError(
        500,
        "INVALID_OFFICIAL_PRICING_CONTEXT",
        "Authoritative Pricing context is inconsistent."
      );

    const pricingEngine = calculatePricing({
      policy: context.policy,
      definition: context.definition,
      costBasis: {
        totalCost: costing.totalCost,
        productId: costing.productId,
        productVersionId: costing.productVersionId,
        productVersionNumber: costing.productVersionNumber,
        productVersionRevision: costing.productVersionRevision,
        costingAggregationVersion: costing.aggregationVersion,
        effectiveCostAt: costing.effectiveCostAt,
        commercialQuantity: costing.commercialQuantity,
      },
    });

    const commercial = calculateCommercialPricing({
      baseSellingPrice: pricingEngine.unroundedTotalSellingPrice.amount,
      minimumSellingPrice: context.productSettings.minimumSellingPrice,
      financialRate: context.payment.rate,
    });

    const publicResult = officialPricingPublicResultSchema.safeParse({
      calculationVersion: OFFICIAL_PRICING_CALCULATION_VERSION,
      productId: costing.productId,
      productVersionId: costing.productVersionId,
      productVersionNumber: costing.productVersionNumber,
      productVersionRevision: costing.productVersionRevision,
      commercialQuantity: costing.commercialQuantity,
      installments: request.installments,
      roundingRule: commercial.roundingRule,
      totalSellingPrice: commercial.totalSellingPrice,
    });
    if (!publicResult.success)
      throw new OfficialPricingCalculationError(
        500,
        "INVALID_OFFICIAL_PRICING_RESULT",
        "Official Pricing result is incompatible with its public contract."
      );

    return {
      publicResult: publicResult.data,
      costing,
      pricingEngine,
      commercial,
      privateProvenance: {
        productPricingSettingsRevision: context.productSettings.revision,
        paymentRateSource: context.payment.source,
        paymentTermRevision: context.payment.revision,
      },
    };
  }
}
