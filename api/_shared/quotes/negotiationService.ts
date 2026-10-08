import {
  calculateQuoteCommercial,
  evaluateQuoteNegotiation,
  quoteNegotiationRequestSchema,
  toPublicQuoteNegotiation,
  QuoteNegotiationDomainError,
  type QuoteNegotiationEvaluation,
  type QuoteNegotiationPublicResult,
} from "../../../shared/quotes/index.js";
import type {
  OfficialQuoteCalculationResult,
} from "./calculationService.js";

export class QuoteNegotiationServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "INVALID_QUOTE_NEGOTIATION"
      | "QUOTE_NEGOTIATION_FORBIDDEN"
      | "BELOW_MINIMUM_OVERRIDE_REQUIRED"
      | "INVALID_QUOTE_NEGOTIATION_CONTEXT",
    message: string
  ) {
    super(message);
    this.name = "QuoteNegotiationServiceError";
  }
}

const mapDomainError = (error: QuoteNegotiationDomainError): never => {
  if (error.code === "BELOW_MINIMUM_OVERRIDE_REQUIRED")
    throw new QuoteNegotiationServiceError(
      422,
      "BELOW_MINIMUM_OVERRIDE_REQUIRED",
      "Selling below the configured minimum requires explicit manager override."
    );

  throw new QuoteNegotiationServiceError(
    400,
    error.code === "INVALID_QUOTE_NEGOTIATION_CONTEXT"
      ? "INVALID_QUOTE_NEGOTIATION_CONTEXT"
      : "INVALID_QUOTE_NEGOTIATION",
    "Quote negotiation is invalid."
  );
};

export function minimumAllowedQuoteTotal(
  calculation: OfficialQuoteCalculationResult
) {
  const pricing = calculation.pricing;
  const minimumCommercial = calculateQuoteCommercial({
    productSellingPrice: pricing.commercial.minimumSellingPrice.amount,
    financialRate: pricing.commercial.financialRate,
    installationRequested: calculation.publicResult.installation.requested,
    installationAreaM2: calculation.publicResult.installation.areaM2,
    munckRequestedHours: calculation.publicResult.munck.requested
      ? calculation.publicResult.munck.requestedHours
      : null,
    settings: calculation.installationSettings,
  });
  return minimumCommercial.totalSellingPrice.amount;
}

export class QuoteNegotiationService {
  evaluate(
    calculation: OfficialQuoteCalculationResult,
    input: unknown,
    isManager: boolean
  ): {
    privateEvaluation: QuoteNegotiationEvaluation;
    publicResult: QuoteNegotiationPublicResult;
  } {
    const parsed = quoteNegotiationRequestSchema.safeParse(
      input ?? { mode: "OFFICIAL" }
    );
    if (!parsed.success)
      throw new QuoteNegotiationServiceError(
        400,
        "INVALID_QUOTE_NEGOTIATION",
        "Quote negotiation request is invalid."
      );

    if (parsed.data.mode === "MANAGER_FINAL_PRICE" && !isManager)
      throw new QuoteNegotiationServiceError(
        403,
        "QUOTE_NEGOTIATION_FORBIDDEN",
        "Only managers may adjust the final Quote price."
      );

    try {
      const privateEvaluation = evaluateQuoteNegotiation({
        officialTotal: calculation.publicResult.totalSellingPrice.amount,
        minimumAllowedTotal: minimumAllowedQuoteTotal(calculation),
        negotiation: parsed.data,
      });
      return {
        privateEvaluation,
        publicResult: toPublicQuoteNegotiation(privateEvaluation),
      };
    } catch (error) {
      if (error instanceof QuoteNegotiationDomainError)
        return mapDomainError(error);
      throw error;
    }
  }
}
