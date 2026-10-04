import { z } from "zod";
import { productIdSchema } from "./product.js";

export const productVersionIdSchema = z
  .string()
  .uuid()
  .brand<"ProductVersionId">();
export type ProductVersionId = z.infer<typeof productVersionIdSchema>;
export const PRODUCT_VERSION_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "PUBLISHED",
  "RETIRED",
] as const;
export const productVersionStatusSchema = z.enum(PRODUCT_VERSION_STATUSES);
export type ProductVersionStatus = z.infer<typeof productVersionStatusSchema>;

export const productVersionSchema = z
  .object({
    id: productVersionIdSchema,
    productId: productIdSchema,
    versionNumber: z.number().int().positive(),
    status: productVersionStatusSchema,
    revision: z.number().int().positive(),
    notes: z.string().nullable().optional(),
    createdAt: z.string().datetime({ offset: true }),
    createdBy: z.string().uuid(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    publishedBy: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((version, context) => {
    const hasPublicationMetadata =
      version.publishedAt !== null && version.publishedBy !== null;
    if ((version.publishedAt === null) !== (version.publishedBy === null))
      context.addIssue({
        code: "custom",
        message: "publishedAt and publishedBy must both be set or null",
      });
    if (
      ["DRAFT", "VALIDATING"].includes(version.status) &&
      hasPublicationMetadata
    )
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: `${version.status} versions cannot have publication metadata`,
      });
    if (
      ["PUBLISHED", "RETIRED"].includes(version.status) &&
      !hasPublicationMetadata
    )
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published versions require publication metadata",
      });
  });
export type ProductVersion = z.infer<typeof productVersionSchema>;
