import { z } from "zod";

export const RESERVED_ENGINE_KEYS = [
  "commercial_quantity",
  "quote_item",
  "engine",
  "system",
] as const;
export const RESERVED_ENGINE_PREFIXES = ["system_", "engine_"] as const;

/** Reserved checks are exact and case-sensitive; invalid casing is rejected separately. */
export function isReservedEngineKey(key: string): boolean {
  return (
    (RESERVED_ENGINE_KEYS as readonly string[]).includes(key) ||
    RESERVED_ENGINE_PREFIXES.some(prefix => key.startsWith(prefix))
  );
}

export const configurableKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Key must use lowercase ASCII snake_case")
  .refine(
    key => !isReservedEngineKey(key),
    "Key belongs to the reserved engine namespace"
  );

export type ConfigurableKey = z.infer<typeof configurableKeySchema>;
