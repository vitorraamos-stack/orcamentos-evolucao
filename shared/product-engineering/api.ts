import { z } from "zod";
import { productComponentSchema } from "./components.js";
import { productInputSchema } from "./inputs.js";
import { productVariableSchema } from "./variables.js";

const uuid = z.string().uuid();
const expectedRevision = z.number().int().positive();

export const productEngineeringMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE_PRODUCT"),
      product: z
        .object({
          code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
          name: z.string().trim().min(1),
          description: z.string().nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("CREATE_VERSION"),
      sourceVersionId: uuid,
      expectedRevision,
    })
    .strict(),
  z
    .object({
      action: z.literal("SAVE_DRAFT"),
      versionId: uuid,
      expectedRevision,
      notes: z.string().nullable().optional(),
      inputs: z.array(productInputSchema),
      variables: z.array(productVariableSchema),
      components: z.array(productComponentSchema),
    })
    .strict(),
  z
    .object({
      action: z.literal("START_VALIDATION"),
      versionId: uuid,
      expectedRevision,
    })
    .strict(),
  z
    .object({
      action: z.literal("RETURN_TO_DRAFT"),
      versionId: uuid,
      expectedRevision,
    })
    .strict(),
  z
    .object({
      action: z.literal("PUBLISH_VERSION"),
      versionId: uuid,
      expectedRevision,
    })
    .strict(),
]);

export type ProductEngineeringMutation = z.infer<
  typeof productEngineeringMutationSchema
>;
export type ProductEngineeringApiSuccess<T> = { ok: true; data: T };
export type ProductEngineeringApiFailure = {
  ok: false;
  error: { code: string; message: string; issues?: readonly unknown[] };
};
export type ProductEngineeringApiResponse<T> =
  | ProductEngineeringApiSuccess<T>
  | ProductEngineeringApiFailure;

export const createProductResultSchema = z
  .object({
    productId: uuid,
    versionId: uuid,
    revision: expectedRevision,
  })
  .strict();
export type CreateProductResult = z.infer<typeof createProductResultSchema>;
export const createVersionResultSchema = z
  .object({
    productId: uuid,
    sourceVersionId: uuid,
    versionId: uuid,
    versionNumber: expectedRevision,
    revision: z.literal(1),
  })
  .strict();
export type CreateVersionResult = z.infer<typeof createVersionResultSchema>;
export type SaveDraftResult = { revision: number; issues: readonly unknown[] };
export type LifecycleTransitionResult = {
  version: import("./productVersion.js").ProductVersion;
};
export type StartValidationResult = LifecycleTransitionResult & {
  issues: readonly unknown[];
};
export type PublishVersionResult = StartValidationResult;
