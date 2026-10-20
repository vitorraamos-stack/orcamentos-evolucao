import { z } from "zod";

const uuid = z.string().uuid();

export const productCommercialLinkCreateSchema = z.object({
  action: z.literal("LINK_PRODUCT"),
  productId: uuid,
  libraryProductId: uuid,
}).strict();

export const productCommercialLinkListQuerySchema = z.object({
  productId: uuid.optional(),
}).strict();

export const productCommercialLinkSchema = z.object({
  productId: uuid,
  libraryProductId: uuid,
  createdAt: z.string().min(1),
  createdBy: uuid,
}).strict();

export type ProductCommercialLink = z.infer<typeof productCommercialLinkSchema>;
export type ProductCommercialLinkCreate = z.infer<typeof productCommercialLinkCreateSchema>;
