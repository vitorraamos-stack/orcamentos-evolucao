import { z } from "zod";
import {
  decimalFrom,
  pricingRateSchema,
  type PricingPolicy,
  type PricingPolicyVersionDefinition,
  type ProductPricingSettings,
} from "../../../shared/pricing/index.js";
import {
  PricingPersistenceCompatibilityError,
  mapPricingAggregate,
  mapProductPricingSettings,
} from "./mappers.js";

export const OFFICIAL_PAYMENT_RATE_SOURCES = [
  "SYSTEM_ZERO",
  "CONFIGURED",
] as const;

export const officialPaymentRateSourceSchema = z.enum(
  OFFICIAL_PAYMENT_RATE_SOURCES
);

export type OfficialPaymentRateSource = z.infer<
  typeof officialPaymentRateSourceSchema
>;

const paymentContextSchema = z
  .object({
    source: officialPaymentRateSourceSchema,
    installments: z.number().int().min(1).max(12),
    rate: pricingRateSchema,
    revision: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const zero = decimalFrom(value.rate).isZero();
    if (value.source === "SYSTEM_ZERO") {
      if (value.installments > 3)
        ctx.addIssue({
          code: "custom",
          path: ["installments"],
          message: "SYSTEM_ZERO is allowed only from 1x to 3x",
        });
      if (!zero)
        ctx.addIssue({
          code: "custom",
          path: ["rate"],
          message: "SYSTEM_ZERO rate must be zero",
        });
      if (value.revision !== null)
        ctx.addIssue({
          code: "custom",
          path: ["revision"],
          message: "SYSTEM_ZERO does not have a persisted revision",
        });
      return;
    }
    if (value.installments < 4)
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: "CONFIGURED payment terms start at 4x",
      });
    if (value.revision === null)
      ctx.addIssue({
        code: "custom",
        path: ["revision"],
        message: "CONFIGURED payment terms require a revision",
      });
  });

export type OfficialPricingPaymentContext = z.infer<
  typeof paymentContextSchema
>;

export interface OfficialPricingContext {
  readonly productSettings: ProductPricingSettings;
  readonly policy: PricingPolicy;
  readonly definition: PricingPolicyVersionDefinition;
  readonly payment: OfficialPricingPaymentContext;
}

const incompatible = (): never => {
  throw new PricingPersistenceCompatibilityError(
    "PRICING_PERSISTENCE_COMPATIBILITY_ERROR"
  );
};

export function mapOfficialPricingContext(dto: any): OfficialPricingContext {
  const aggregate = mapPricingAggregate(dto);
  const productSettings = mapProductPricingSettings(dto?.product_settings);
  if (productSettings.pricingPolicyId !== aggregate.policy.id)
    return incompatible();

  if (typeof dto?.payment_term?.rate !== "string") return incompatible();
  const payment = paymentContextSchema.safeParse({
    source: dto.payment_term.source,
    installments: dto.payment_term.installments,
    rate: dto.payment_term.rate,
    revision: dto.payment_term.revision,
  });
  if (!payment.success) return incompatible();

  return {
    productSettings,
    policy: aggregate.policy,
    definition: aggregate.definition,
    payment: payment.data,
  };
}
