import type {
  OrderDeletionResult,
  OrderDeletionStorageCleanupResult,
} from "../repositories/orderGovernanceRepository";

export function requiresDeletedOrderStorageCleanup(result: OrderDeletionResult) {
  return result.r2_keys.length > 0;
}

export function isDeletedOrderStorageCleanupComplete(
  response: OrderDeletionStorageCleanupResult,
) {
  return (
    response.storageDeleteSucceeded !== false &&
    response.auditUpdateSucceeded !== false &&
    response.errors.length === 0
  );
}
