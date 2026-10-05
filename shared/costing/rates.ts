import { z } from "zod";
import { moneySchema } from "../calculation-engine/contracts/index.js";
import { decimalFrom } from "../calculation-engine/decimal/index.js";
import { CostingDomainError } from "./errors.js";
import {
  fixedCostDefinitionIdSchema,
  materialIdSchema,
  outsourcedServiceIdSchema,
  processDefinitionIdSchema,
} from "./resources.js";
import { costableUnitIdSchema } from "./units.js";

export const costRateIdSchema = z.string().uuid().brand<"CostRateId">();
export type CostRateId = z.infer<typeof costRateIdSchema>;
export const costTimestampSchema = z.iso.datetime({ offset: true });
export type CostTimestamp = z.infer<typeof costTimestampSchema>;

const rateBase = {
  id: costRateIdSchema,
  ...moneySchema.shape,
  unit: costableUnitIdSchema,
  effectiveFrom: costTimestampSchema,
  effectiveTo: costTimestampSchema.nullable(),
};

function rateChecks(
  rate: {
    amount: z.infer<typeof moneySchema>["amount"];
    effectiveFrom: string;
    effectiveTo: string | null;
  },
  ctx: z.RefinementCtx
): void {
  // Monetary comparison stays in Decimal; it never crosses binary floating point.
  if (decimalFrom(rate.amount).isNegative()) {
    ctx.addIssue({
      code: "custom",
      message: "NEGATIVE_COST_RATE",
      path: ["amount"],
    });
  }
  // Effective intervals are lower-inclusive and upper-exclusive: [from, to).
  if (
    rate.effectiveTo !== null &&
    Date.parse(rate.effectiveTo) <= Date.parse(rate.effectiveFrom)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "INVALID_COST_INTERVAL",
      path: ["effectiveTo"],
    });
  }
}

const materialRateObject = z
  .object({
    ...rateBase,
    type: z.literal("MATERIAL"),
    materialId: materialIdSchema,
  })
  .strict();
const processRateObject = z
  .object({
    ...rateBase,
    type: z.literal("PROCESS"),
    processDefinitionId: processDefinitionIdSchema,
  })
  .strict();
const outsourcedRateObject = z
  .object({
    ...rateBase,
    type: z.literal("OUTSOURCED_SERVICE"),
    outsourcedServiceId: outsourcedServiceIdSchema,
  })
  .strict();
const fixedRateObject = z
  .object({
    ...rateBase,
    type: z.literal("FIXED_COST"),
    fixedCostDefinitionId: fixedCostDefinitionIdSchema,
  })
  .strict();

export const materialCostRateSchema =
  materialRateObject.superRefine(rateChecks);
export const processCostRateSchema = processRateObject.superRefine(rateChecks);
export const outsourcedServiceCostRateSchema =
  outsourcedRateObject.superRefine(rateChecks);
export const fixedCostRateSchema = fixedRateObject.superRefine(rateChecks);
export const costRateSchema = z
  .discriminatedUnion("type", [
    materialRateObject,
    processRateObject,
    outsourcedRateObject,
    fixedRateObject,
  ])
  .superRefine(rateChecks);

export type MaterialCostRate = z.infer<typeof materialCostRateSchema>;
export type ProcessCostRate = z.infer<typeof processCostRateSchema>;
export type OutsourcedServiceCostRate = z.infer<
  typeof outsourcedServiceCostRateSchema
>;
export type FixedCostRate = z.infer<typeof fixedCostRateSchema>;
export type CostRate = z.infer<typeof costRateSchema>;

export function assertValidCostRate(rate: CostRate): void {
  const result = costRateSchema.safeParse(rate);
  if (result.success) return;
  const negative = result.error.issues.some(
    issue => issue.message === "NEGATIVE_COST_RATE"
  );
  throw new CostingDomainError(
    negative ? "NEGATIVE_COST_RATE" : "INVALID_COST_INTERVAL",
    negative ? "Cost rate cannot be negative" : "Cost rate interval is invalid"
  );
}
