import { z } from "zod";
import { calculationRequestSchema } from "../calculation-engine/contracts/index.js";

/** The complete and intentionally small public input for an official costing. */
export const officialCostingRequestSchema = z
  .object({
    productVersionId: z.string().uuid(),
    request: calculationRequestSchema,
  })
  .strict();

export type OfficialCostingRequest = z.infer<
  typeof officialCostingRequestSchema
>;
