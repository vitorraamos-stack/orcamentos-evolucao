import type { ProductVersion, ProductVersionStatus } from "./productVersion";
import { ProductEngineeringError } from "./errors";
import type { EngineeringValidationResult } from "./validation";

const transitions: Readonly<
  Record<ProductVersionStatus, readonly ProductVersionStatus[]>
> = {
  DRAFT: ["VALIDATING"],
  VALIDATING: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["RETIRED"],
  RETIRED: [],
};
export function assertProductVersionTransition(
  from: ProductVersionStatus,
  to: ProductVersionStatus
): void {
  if (!transitions[from].includes(to))
    throw new ProductEngineeringError(
      "INVALID_STATUS_TRANSITION",
      `Product version cannot transition from ${from} to ${to}`,
      { from, to }
    );
}
export function assertValidatedProductVersionTransition(
  from: ProductVersionStatus,
  to: ProductVersionStatus,
  validation: EngineeringValidationResult
): void {
  assertProductVersionTransition(from, to);
  if ((to === "VALIDATING" || to === "PUBLISHED") && !validation.valid)
    throw new ProductEngineeringError(
      "PUBLICATION_VALIDATION_FAILED",
      `Product version cannot enter ${to} with validation errors`,
      { issues: validation.issues }
    );
}
export function assertProductVersionEditable(
  version: Pick<ProductVersion, "status">
): void {
  if (version.status !== "DRAFT")
    throw new ProductEngineeringError(
      "VERSION_NOT_EDITABLE",
      `${version.status} product versions are immutable; return VALIDATING versions to DRAFT before editing`
    );
}
export function assertExpectedRevision(
  current: number,
  expected: number
): void {
  if (current !== expected)
    throw new ProductEngineeringError(
      "REVISION_CONFLICT",
      `Expected revision ${expected}, but current revision is ${current}`,
      { current, expected }
    );
}
export function nextRevision(current: number, expected: number): number {
  assertExpectedRevision(current, expected);
  return current + 1;
}
