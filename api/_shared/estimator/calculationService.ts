import {
  calculateEstimateCommercial,
  officialEstimatePublicResultSchema,
  officialEstimateRequestSchema,
  OFFICIAL_ESTIMATE_CALCULATION_VERSION,
  type OfficialEstimatePublicResult,
} from "../../../shared/estimator/index.js";
import {
  compareDecimal,
  decimalString,
  multiplyDecimal,
  type DecimalString,
} from "../../../shared/calculation-engine/decimal/index.js";
import { convertUnit } from "../../../shared/calculation-engine/units/index.js";
import type { PricingInstallationSettings } from "../../../shared/pricing/index.js";
import type {
  OfficialPricingCalculationResult,
} from "../pricing/calculationService.js";

export interface OfficialPricingCalculator {
  calculate(input: unknown): Promise<OfficialPricingCalculationResult>;
}

export interface EstimatorInstallationSettingsLoader {
  loadInstallationSettings(): Promise<PricingInstallationSettings>;
}

export class OfficialEstimateCalculationError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "INVALID_OFFICIAL_ESTIMATE_REQUEST"
      | "INSTALLATION_AREA_UNAVAILABLE"
      | "INVALID_OFFICIAL_ESTIMATE_RESULT",
    message: string
  ) {
    super(message);
    this.name = "OfficialEstimateCalculationError";
  }
}

function resolvedMeterInput(
  pricing: OfficialPricingCalculationResult,
  key: "width" | "height"
): DecimalString {
  const input = pricing.costing.resolvedInputs.find(item => item.key === key);
  if (
    !input ||
    input.value.kind !== "decimal" ||
    input.value.unit === null
  )
    throw new OfficialEstimateCalculationError(
      422,
      "INSTALLATION_AREA_UNAVAILABLE",
      "Installation area cannot be derived from this product."
    );
  try {
    const normalized = convertUnit(input.value.value, input.value.unit, "m");
    if (compareDecimal(normalized, decimalString("0")) <= 0)
      throw new Error("NON_POSITIVE_INSTALLATION_DIMENSION");
    return normalized;
  } catch {
    throw new OfficialEstimateCalculationError(
      422,
      "INSTALLATION_AREA_UNAVAILABLE",
      "Installation area cannot be derived from this product."
    );
  }
}

function installationAreaM2(
  pricing: OfficialPricingCalculationResult
): DecimalString {
  const width = resolvedMeterInput(pricing, "width");
  const height = resolvedMeterInput(pricing, "height");
  return multiplyDecimal(
    multiplyDecimal(width, height),
    pricing.costing.commercialQuantity
  );
}

export interface OfficialEstimateCalculationResult {
  readonly publicResult: OfficialEstimatePublicResult;
  readonly pricing: OfficialPricingCalculationResult;
  readonly installationSettingsRevision: number | null;
  readonly installationSettings: PricingInstallationSettings | null;
}

export class OfficialEstimateCalculationService {
  constructor(
    private readonly pricing: OfficialPricingCalculator,
    private readonly installationSettings: EstimatorInstallationSettingsLoader
  ) {}

  async calculate(input: unknown): Promise<OfficialEstimateCalculationResult> {
    const parsed = officialEstimateRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new OfficialEstimateCalculationError(
        400,
        "INVALID_OFFICIAL_ESTIMATE_REQUEST",
        "Invalid official Quote request."
      );

    const request = parsed.data;
    const pricing = await this.pricing.calculate({
      productVersionId: request.productVersionId,
      request: request.request,
      installments: request.installments,
    });

    const needsAdditionalSettings =
      request.installation.requested || request.munck.requested;
    const settings = needsAdditionalSettings
      ? await this.installationSettings.loadInstallationSettings()
      : null;
    const areaM2 = request.installation.requested
      ? installationAreaM2(pricing)
      : null;
    const munckHours = request.munck.requested
      ? request.munck.hours
      : null;

    const commercial = calculateEstimateCommercial({
      productSellingPrice: pricing.commercial.priceAfterMinimum.amount,
      financialRate: pricing.commercial.financialRate,
      installationRequested: request.installation.requested,
      installationAreaM2: areaM2,
      munckRequestedHours: munckHours,
      settings,
    });

    const publicResult = officialEstimatePublicResultSchema.safeParse({
      calculationVersion: OFFICIAL_ESTIMATE_CALCULATION_VERSION,
      productId: pricing.publicResult.productId,
      productVersionId: pricing.publicResult.productVersionId,
      productVersionNumber: pricing.publicResult.productVersionNumber,
      productVersionRevision: pricing.publicResult.productVersionRevision,
      commercialQuantity: pricing.publicResult.commercialQuantity,
      installments: pricing.publicResult.installments,
      productSellingPrice: commercial.productSellingPrice,
      installation: commercial.installation,
      munck: commercial.munck,
      subtotalBeforeFinancialRate: commercial.subtotalBeforeFinancialRate,
      roundingRule: commercial.roundingRule,
      totalSellingPrice: commercial.totalSellingPrice,
    });

    if (!publicResult.success)
      throw new OfficialEstimateCalculationError(
        500,
        "INVALID_OFFICIAL_ESTIMATE_RESULT",
        "Official estimate result is incompatible with its public contract."
      );

    return {
      publicResult: publicResult.data,
      pricing,
      installationSettingsRevision: settings?.revision ?? null,
      installationSettings: settings,
    };
  }
}
