import { describe, expect, it } from "vitest";
import type {
  OrderDeletionResult,
  OrderDeletionStorageCleanupResult,
} from "../repositories/orderGovernanceRepository";
import {
  isDeletedOrderStorageCleanupComplete,
  requiresDeletedOrderStorageCleanup,
} from "./orderDeletionRecovery";

const result = (r2Keys: string[]): OrderDeletionResult => ({
  audit_id: "audit-1",
  os_id: "os-1",
  display_number: "TESTE-1",
  sale_number: "TESTE-1",
  client_name: "Cliente teste",
  counts: {},
  r2_keys: r2Keys,
  r2_cleanup_status: r2Keys.length ? "PENDING" : "NOT_REQUIRED",
});

const cleanup = (
  overrides: Partial<OrderDeletionStorageCleanupResult> = {},
): OrderDeletionStorageCleanupResult => ({
  deleted: 1,
  errors: [],
  storageDeleteSucceeded: true,
  auditUpdateSucceeded: true,
  ...overrides,
});

describe("orderDeletionRecovery", () => {
  it("não exige cleanup quando o hard delete não retornou chaves R2", () => {
    expect(requiresDeletedOrderStorageCleanup(result([]))).toBe(false);
  });

  it("mantém cleanup pendente quando há chaves R2", () => {
    expect(requiresDeletedOrderStorageCleanup(result(["os_orders/os-1/a.jpg"]))).toBe(true);
  });

  it("considera cleanup concluído apenas quando storage e auditoria terminaram sem erros", () => {
    expect(isDeletedOrderStorageCleanupComplete(cleanup())).toBe(true);
    expect(isDeletedOrderStorageCleanupComplete(cleanup({ errors: [{ code: "R2" }] }))).toBe(false);
    expect(isDeletedOrderStorageCleanupComplete(cleanup({ storageDeleteSucceeded: false }))).toBe(false);
    expect(isDeletedOrderStorageCleanupComplete(cleanup({ auditUpdateSucceeded: false }))).toBe(false);
  });
});
