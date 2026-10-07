import { z } from "zod";
import { decimalFrom, decimalStringSchema } from "../calculation-engine/decimal/index.js";
import { pricingTimestampSchema } from "./contracts.js";

const revisionSchema = z.number().int().positive();
const actorIdSchema = z.string().uuid();

const positive = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThan("0");
  } catch {
    return false;
  }
}, "Value must be greater than zero");

const nonNegative = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThanOrEqualTo("0");
  } catch {
    return false;
  }
}, "Value must be non-negative");

export const pricingInstallationSettingsSchema = z
  .object({
    tier1MaxAreaM2: positive,
    tier1Price: nonNegative,
    tier2MaxAreaM2: positive,
    tier2Price: nonNegative,
    tier3Price: nonNegative,
    munckHourlyPrice: nonNegative,
    munckMinimumHours: positive,
    revision: revisionSchema,
    updatedAt: pricingTimestampSchema,
    updatedBy: actorIdSchema,
  })
  .strict()
  .superRefine((settings, ctx) => {
    if (!decimalFrom(settings.tier2MaxAreaM2).greaterThan(settings.tier1MaxAreaM2))
      ctx.addIssue({
        code: "custom",
        path: ["tier2MaxAreaM2"],
        message: "Tier 2 maximum area must be greater than tier 1",
      });
  });

export type PricingInstallationSettings = z.infer<typeof pricingInstallationSettingsSchema>;
