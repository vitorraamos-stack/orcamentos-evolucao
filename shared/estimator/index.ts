import { z } from "zod";
import {
  OFFICIAL_QUOTE_CALCULATION_VERSION,
  quoteInstallationRequestSchema,
  quoteMunckRequestSchema,
  officialQuoteRequestSchema,
  quoteCommercialInputSchema,
  quoteCommercialResultSchema,
  calculateQuoteCommercial,
  officialQuotePublicResultSchema,
  quoteFormApiRequestSchema,
  quoteFormProductSchema,
  quoteFormDefinitionSchema,
} from "../quotes/index.js";

export const OFFICIAL_ESTIMATE_CALCULATION_VERSION =
  OFFICIAL_QUOTE_CALCULATION_VERSION;

export const estimatorInstallationRequestSchema =
  quoteInstallationRequestSchema;
export const estimatorMunckRequestSchema = quoteMunckRequestSchema;
export const officialEstimateRequestSchema = officialQuoteRequestSchema;
export const officialEstimateApiRequestSchema = officialEstimateRequestSchema
  .extend({ action: z.literal("CALCULATE_ESTIMATE") })
  .strict();

export const estimateCommercialInputSchema = quoteCommercialInputSchema;
export const estimateCommercialResultSchema = quoteCommercialResultSchema;
export const calculateEstimateCommercial = calculateQuoteCommercial;
export const officialEstimatePublicResultSchema =
  officialQuotePublicResultSchema;

export const estimatorFormApiRequestSchema = quoteFormApiRequestSchema
  .extend({ action: z.literal("GET_ESTIMATOR_FORM") })
  .strict();
export const estimatorFormProductSchema = quoteFormProductSchema;
export const estimatorFormDefinitionSchema = quoteFormDefinitionSchema;

export type OfficialEstimateRequest = z.infer<
  typeof officialEstimateRequestSchema
>;
export type OfficialEstimateApiRequest = z.infer<
  typeof officialEstimateApiRequestSchema
>;
export type EstimateCommercialInput = z.infer<
  typeof estimateCommercialInputSchema
>;
export type EstimateCommercialResult = z.infer<
  typeof estimateCommercialResultSchema
>;
export type OfficialEstimatePublicResult = z.infer<
  typeof officialEstimatePublicResultSchema
>;
export type EstimatorFormProduct = z.infer<
  typeof estimatorFormProductSchema
>;
export type EstimatorFormDefinition = z.infer<
  typeof estimatorFormDefinitionSchema
>;
