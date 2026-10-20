import { z } from "zod";

const uuid = z.string().uuid();

export const publishedCommercialQuerySchema = z.union([
  z.object({ productId: uuid }).strict(),
  z.object({ libraryProductId: uuid }).strict(),
]);

const fieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "number", "dimensions", "select", "multi", "yesno", "attachment"]),
  required: z.boolean(),
  when: z.enum(["always", "paint", "install", "noart"]),
  options: z.array(z.string()).nullable().optional(),
  help: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
}).strip();

const photoSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  caption: z.string(),
  kind: z.enum(["application", "detail", "render", "process"]),
  cover: z.boolean().optional(),
}).strip();

const complementSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: z.enum(["separate", "included"]),
  when: z.enum(["always", "install", "noart"]),
}).strip();

const ruleSchema = z.object({
  id: z.string(),
  field: z.string(),
  equals: z.string(),
  action: z.enum(["note", "require_photos", "technical_review"]),
  message: z.string(),
}).strip();

const commercialRulesSchema = z.object({
  photos_policy: z.enum(["recommend", "required", "waive"]),
  special_fixing_review: z.literal(true),
  conditions: z.array(ruleSchema).optional(),
}).strip();

export const commercialPublishedContentSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string(),
  applications: z.string(),
  fields: z.array(fieldSchema),
  gallery: z.array(photoSchema),
  complements: z.array(complementSchema),
  guidance: z.string(),
  rules: commercialRulesSchema,
}).strip();

export const publishedCommercialAdapterResultSchema =
  commercialPublishedContentSchema.extend({
    productId: uuid,
    libraryProductId: uuid,
    commercialVersion: z.number().int().positive(),
    commercialPublishedAt: z.string().min(1),
    engineeringVersion: z.object({
      id: uuid,
      number: z.number().int().positive(),
    }).strict().nullable(),
    mappingStatus: z.enum(["NOT_ASSESSED", "ENGINEERING_UNAVAILABLE"]),
    pricingStatus: z.literal("NOT_CHECKED"),
  }).strict();

export type PublishedCommercialAdapterResult =
  z.infer<typeof publishedCommercialAdapterResultSchema>;
