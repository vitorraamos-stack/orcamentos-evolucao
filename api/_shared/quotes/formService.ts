import {
  quoteFormDefinitionSchema,
  type QuoteFormDefinition,
} from "../../../shared/quotes/index.js";
import { CostingService } from "../costing/service.js";
import {
  PricingPersistenceService,
  PricingPersistenceServiceError,
} from "../pricing/service.js";
import { ProductEngineeringService } from "../product-engineering/service.js";

type ProductEngineeringReader = Pick<ProductEngineeringService, "loadDefinition">;
type CostingReader = Pick<CostingService, "loadProductParameters">;
type PricingReader = Pick<
  PricingPersistenceService,
  "loadPaymentTerm" | "loadInstallationSettings"
>;

export class QuoteFormServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: "QUOTE_FORM_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "QuoteFormServiceError";
  }
}

const isMissingPricing = (
  error: unknown,
  code: "PRICING_PAYMENT_TERM_NOT_FOUND" | "PRICING_INSTALLATION_SETTINGS_NOT_FOUND"
) =>
  error instanceof PricingPersistenceServiceError && error.code === code;

export class OfficialQuoteFormService {
  private readonly productEngineering: ProductEngineeringReader;
  private readonly costing: CostingReader;
  private readonly pricing: PricingReader;

  constructor(
    private readonly db: any,
    productEngineering?: ProductEngineeringReader,
    costing?: CostingReader,
    pricing?: PricingReader
  ) {
    this.productEngineering =
      productEngineering ?? new ProductEngineeringService(db);
    this.costing = costing ?? new CostingService(db);
    this.pricing = pricing ?? new PricingPersistenceService(db);
  }

  private async availableInstallments() {
    const result = [1, 2, 3];
    for (let installments = 4; installments <= 12; installments += 1) {
      try {
        await this.pricing.loadPaymentTerm(installments);
        result.push(installments);
      } catch (error) {
        if (!isMissingPricing(error, "PRICING_PAYMENT_TERM_NOT_FOUND"))
          throw error;
      }
    }
    return result;
  }

  private async installationConfigured() {
    try {
      await this.pricing.loadInstallationSettings();
      return true;
    } catch (error) {
      if (isMissingPricing(error, "PRICING_INSTALLATION_SETTINGS_NOT_FOUND"))
        return false;
      throw error;
    }
  }

  async load(): Promise<QuoteFormDefinition> {
    const [productsResult, settingsResult, installments, additionsConfigured] =
      await Promise.all([
        this.db
          .from("products")
          .select("id,code,name")
          .eq("status", "ACTIVE")
          .order("name"),
        this.db.from("product_pricing_settings").select("product_id"),
        this.availableInstallments(),
        this.installationConfigured(),
      ]);

    if (productsResult.error || settingsResult.error)
      throw new QuoteFormServiceError(
        500,
        "QUOTE_FORM_UNAVAILABLE",
        "Quote form configuration is unavailable."
      );

    const configuredProductIds = new Set(
      (settingsResult.data ?? []).map((row: any) => String(row.product_id))
    );
    const products: QuoteFormDefinition["products"] = [];

    for (const product of productsResult.data ?? []) {
      if (!configuredProductIds.has(String(product.id))) continue;

      const versionResult = await this.db
        .from("product_versions")
        .select("id,version_number")
        .eq("product_id", product.id)
        .eq("status", "PUBLISHED")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (versionResult.error)
        throw new QuoteFormServiceError(
          500,
          "QUOTE_FORM_UNAVAILABLE",
          "Quote form configuration is unavailable."
        );
      if (!versionResult.data) continue;

      const [definition, parameters] = await Promise.all([
        this.productEngineering.loadDefinition(versionResult.data.id),
        this.costing.loadProductParameters(product.id),
      ]);
      const serverManaged = new Set(parameters.map(parameter => parameter.key));
      const inputs = definition.inputs
        .filter(input => !serverManaged.has(input.key))
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)
        );
      const physicalLengthUnits = new Set(["mm", "cm", "m"]);
      const width = inputs.find(
        input =>
          input.key === "width" &&
          input.type === "DECIMAL" &&
          input.unit !== null &&
          physicalLengthUnits.has(input.unit)
      );
      const height = inputs.find(
        input =>
          input.key === "height" &&
          input.type === "DECIMAL" &&
          input.unit !== null &&
          physicalLengthUnits.has(input.unit)
      );

      products.push({
        productId: product.id,
        code: product.code,
        name: product.name,
        productVersionId: versionResult.data.id,
        productVersionNumber: versionResult.data.version_number,
        inputs,
        installationAvailable:
          additionsConfigured && Boolean(width) && Boolean(height),
      });
    }

    return quoteFormDefinitionSchema.parse({
      products,
      availableInstallments: installments,
    });
  }
}
