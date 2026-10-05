import { z } from "zod";
import { costableUnitIdSchema } from "./units.js";

export const COST_RESOURCE_TYPES = [
  "MATERIAL",
  "PROCESS",
  "OUTSOURCED_SERVICE",
  "FIXED_COST",
] as const;
export const costResourceTypeSchema = z.enum(COST_RESOURCE_TYPES);
export type CostResourceType = z.infer<typeof costResourceTypeSchema>;

export const COST_RESOURCE_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;
export const costResourceStatusSchema = z.enum(COST_RESOURCE_STATUSES);
export type CostResourceStatus = z.infer<typeof costResourceStatusSchema>;

export const materialIdSchema = z.string().uuid().brand<"MaterialId">();
export const processDefinitionIdSchema = z
  .string()
  .uuid()
  .brand<"ProcessDefinitionId">();
export const outsourcedServiceIdSchema = z
  .string()
  .uuid()
  .brand<"OutsourcedServiceId">();
export const fixedCostDefinitionIdSchema = z
  .string()
  .uuid()
  .brand<"FixedCostDefinitionId">();
export type MaterialId = z.infer<typeof materialIdSchema>;
export type ProcessDefinitionId = z.infer<typeof processDefinitionIdSchema>;
export type OutsourcedServiceId = z.infer<typeof outsourcedServiceIdSchema>;
export type FixedCostDefinitionId = z.infer<typeof fixedCostDefinitionIdSchema>;

const definitionBase = {
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().trim().min(1),
  description: z.string(),
  status: costResourceStatusSchema,
  /** Canonical unit for the resource's single official rate series. */
  costUnit: costableUnitIdSchema,
};

export const materialDefinitionSchema = z
  .object({
    ...definitionBase,
    id: materialIdSchema,
    type: z.literal("MATERIAL"),
  })
  .strict();
export const processDefinitionSchema = z
  .object({
    ...definitionBase,
    id: processDefinitionIdSchema,
    type: z.literal("PROCESS"),
  })
  .strict();
export const outsourcedServiceDefinitionSchema = z
  .object({
    ...definitionBase,
    id: outsourcedServiceIdSchema,
    type: z.literal("OUTSOURCED_SERVICE"),
  })
  .strict();
export const fixedCostDefinitionSchema = z
  .object({
    ...definitionBase,
    id: fixedCostDefinitionIdSchema,
    type: z.literal("FIXED_COST"),
  })
  .strict();
export const resourceDefinitionSchema = z.discriminatedUnion("type", [
  materialDefinitionSchema,
  processDefinitionSchema,
  outsourcedServiceDefinitionSchema,
  fixedCostDefinitionSchema,
]);

export type MaterialDefinition = z.infer<typeof materialDefinitionSchema>;
export type ProcessDefinition = z.infer<typeof processDefinitionSchema>;
export type OutsourcedServiceDefinition = z.infer<
  typeof outsourcedServiceDefinitionSchema
>;
export type FixedCostDefinition = z.infer<typeof fixedCostDefinitionSchema>;
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;
