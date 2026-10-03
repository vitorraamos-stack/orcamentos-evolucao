import { z } from "zod";

export const productIdSchema = z.string().uuid().brand<"ProductId">();
export type ProductId = z.infer<typeof productIdSchema>;
export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productSchema = z
  .object({
    id: productIdSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    name: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    status: productStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Product = z.infer<typeof productSchema>;
