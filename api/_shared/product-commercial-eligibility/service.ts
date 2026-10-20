import {
  type CommercialEligibilityRequest,
  type CommercialEligibilityResult,
} from "../../../shared/product-commercial-eligibility/index.js";
import { assessCommercialEligibility } from
  "../../../shared/product-commercial-eligibility/evaluate.js";
import { PublishedCommercialAdapterService } from
  "../product-commercial-adapter/service.js";
import { ProductEngineeringService } from "../product-engineering/service.js";
import { CostingService } from "../costing/service.js";
import {
  PricingPersistenceService,
  PricingPersistenceServiceError,
} from "../pricing/service.js";

type CommercialLoader = Pick<PublishedCommercialAdapterService, "load">;
type EngineeringLoader = Pick<ProductEngineeringService, "loadDefinition">;
type ParametersLoader = Pick<CostingService, "loadProductParameters">;
type PricingLoader = Pick<PricingPersistenceService, "loadOfficialCalculationContext">;

const knownUnavailablePricing = new Set([
  "PRODUCT_PRICING_SETTINGS_NOT_FOUND", "PRICING_POLICY_NOT_FOUND",
  "PRICING_POLICY_NOT_ACTIVE", "PRICING_PUBLISHED_VERSION_NOT_FOUND",
  "PRICING_PAYMENT_TERM_NOT_FOUND",
]);

export class CommercialEligibilityServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "CommercialEligibilityServiceError";
  }
}

/**
 * Read-only eligibility preflight, not a price calculation.
 * Never returns costing resources, prices, rate information, formulas, or drafts.
 */
export class CommercialEligibilityService {
  private readonly publication: CommercialLoader;
  private readonly engineering: EngineeringLoader;
  private readonly parameters: ParametersLoader;
  private readonly pricing: PricingLoader;

  constructor(
    private readonly db: any,
    deps: {
      publication?: CommercialLoader;
      engineering?: EngineeringLoader;
      parameters?: ParametersLoader;
      pricing?: PricingLoader;
    } = {},
  ) {
    this.publication = deps.publication ?? new PublishedCommercialAdapterService(db);
    this.engineering = deps.engineering ?? new ProductEngineeringService(db);
    this.parameters = deps.parameters ?? new CostingService(db);
    this.pricing = deps.pricing ?? new PricingPersistenceService(db);
  }

  async assess(request: CommercialEligibilityRequest): Promise<CommercialEligibilityResult> {
    const publication = await this.publication.load(request.productId);
    // Short-circuit incomplete, invalid and technically blocked requests:
    // none of these requires any pricing/costing reads.
    const preliminary = assessCommercialEligibility(publication, request, null);
    if (["INCOMPLETE", "INVALID_COMBINATION", "TECHNICAL_PENDING"].includes(preliminary.status))
      return preliminary;
    if (request.commercialVersion !== publication.commercialVersion ||
        !publication.engineeringVersion) return preliminary;

    const result = await this.db.from("products")
      .select("code").eq("id", request.productId).maybeSingle();
    if (result.error || !result.data?.code)
      throw new CommercialEligibilityServiceError(
        500, "TECHNICAL_READ_UNAVAILABLE", "Commercial preparation is temporarily unavailable."
      );

    const [definition, serverParameters] = await Promise.all([
      this.engineering.loadDefinition(publication.engineeringVersion.id),
      this.parameters.loadProductParameters(request.productId),
    ]);
    // Isolate the engineering/parameter details on the server.
    const code: string = result.data.code;
    const context = {
      code,
      engineeringInputs: definition.inputs,
      serverManagedKeys: new Set(serverParameters.map(item => item.key)),
      pricingAvailable: false,
    };
    const mapping = assessCommercialEligibility(publication, request, context);
    // A successful mapping with unavailable Pricing is still PREPARATION_ONLY;
    // only an unsupported mapping should stop before pricing preflight.
    if (mapping.reasons.includes("UNSUPPORTED_MAPPING"))
      return mapping;

    // Only supported mapping may reach Pricing preflight. Cost rates remain
    // authoritative at actual calculation time (PR 31D).
    let available = false;
    try {
      await this.pricing.loadOfficialCalculationContext(request.productId, 1);
      available = true;
    } catch (error) {
      if (!(error instanceof PricingPersistenceServiceError) ||
          !knownUnavailablePricing.has(error.code))
        throw error;
    }
    return assessCommercialEligibility(
      publication, request, { ...context, pricingAvailable: available }
    );
  }
}
