import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { summarizeConsultantFinancePending } from "./financePending";

const row = (id: string, os_id: string, status: any) => ({
  id,
  os_id,
  status,
  installment_no: 2,
  total_installments: 2,
  due_date: null,
});

describe("summarizeConsultantFinancePending", () => {
  it("includes only commercial action statuses and deduplicates orders", () => {
    const summary = summarizeConsultantFinancePending([
      row("1", "a", "AWAITING_PROOF"),
      row("2", "a", "REJEITADO"),
      row("3", "b", "CADASTRO_PENDENTE"),
      row("4", "c", "PENDING_REVIEW"),
      row("5", "d", "CONCILIADO"),
      row("6", "e", "LANCADO"),
    ]);
    expect(summary).toEqual({
      secondInstallments: 1,
      registrationPending: 1,
      rejected: 1,
      totalOrders: 2,
    });
  });
});
