import { z } from "zod";
import { productComponentSchema } from "./components";
import { productInputSchema } from "./inputs";
import { productVariableSchema } from "./variables";

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
export type SaveDraftResult = { revision: number; issues: readonly unknown[] };
export type LifecycleTransitionResult = {
  version: import("./productVersion").ProductVersion;
};
export type StartValidationResult = LifecycleTransitionResult & {
  issues: readonly unknown[];
};
export type PublishVersionResult = StartValidationResult;
