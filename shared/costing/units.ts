import type { DecimalString } from "../calculation-engine/decimal/index.js";
import { convertUnit, type UnitId } from "../calculation-engine/units/index.js";
import { z } from "zod";
import { CostingDomainError } from "./errors.js";

export const COSTABLE_UNIT_IDS = [
  "mm",
  "cm",
  "m",
  "m2",
  "linear_m",
  "un",
  "sheet",
  "g",
  "kg",
  "min",
  "h",
] as const;
export const costableUnitIdSchema = z.enum(COSTABLE_UNIT_IDS);
export type CostableUnitId = z.infer<typeof costableUnitIdSchema>;

/** No purchase-unit inference is performed: only universal engine conversions apply. */
export function convertCostQuantity(
  quantity: DecimalString,
  fromUnit: UnitId,
  costUnit: CostableUnitId
): DecimalString {
  if (fromUnit === "BRL") {
    throw new CostingDomainError(
      "INVALID_COST_QUANTITY_UNIT",
      "Currency cannot be used as a resource consumption unit",
      { fromUnit, costUnit }
    );
  }
  try {
    return convertUnit(quantity, fromUnit, costUnit);
  } catch (error) {
    throw new CostingDomainError(
      "INCOMPATIBLE_COST_UNIT",
      `Cannot convert cost quantity from ${fromUnit} to ${costUnit}`,
      {
        fromUnit,
        costUnit,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
}
