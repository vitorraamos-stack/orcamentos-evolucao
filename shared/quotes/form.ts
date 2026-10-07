import { z } from "zod";
import { productIdSchema } from "../product-engineering/product.js";
import { productInputSchema } from "../product-engineering/inputs.js";
import { productVersionIdSchema } from "../product-engineering/productVersion.js";

export const quoteFormApiRequestSchema = z
  .object({
    action: z.literal("GET_QUOTE_FORM"),
    productVersionId: productVersionIdSchema.nullable().default(null),
  })
  .strict();

export const quoteFormProductSchema = z
  .object({
    productId: productIdSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    name: z.string().trim().min(1),
    productVersionId: productVersionIdSchema,
    productVersionNumber: z.number().int().positive(),
    inputs: z.array(productInputSchema),
    installationAvailable: z.boolean(),
    munckAvailable: z.boolean(),
    calculationAvailable: z.boolean(),
  })
  .strict();

export const quoteFormDefinitionSchema = z
  .object({
    products: z.array(quoteFormProductSchema),
    availableInstallments: z.array(z.number().int().min(1).max(12)),
  })
  .strict();

export type QuoteFormProduct = z.infer<typeof quoteFormProductSchema>;
export type QuoteFormDefinition = z.infer<typeof quoteFormDefinitionSchema>;
