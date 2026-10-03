export const PRODUCT_ENGINEERING_ERROR_CODES = [
  "INVALID_STATUS_TRANSITION",
  "VERSION_NOT_EDITABLE",
  "REVISION_CONFLICT",
  "DUPLICATE_INPUT_KEY",
  "DUPLICATE_VARIABLE_KEY",
  "SYMBOL_KEY_COLLISION",
  "INVALID_COMPONENT",
  "PUBLICATION_VALIDATION_FAILED",
] as const;
export type ProductEngineeringErrorCode =
  (typeof PRODUCT_ENGINEERING_ERROR_CODES)[number];
export class ProductEngineeringError extends Error {
  constructor(
    readonly code: ProductEngineeringErrorCode,
    message: string,
    readonly context?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "ProductEngineeringError";
  }
}
