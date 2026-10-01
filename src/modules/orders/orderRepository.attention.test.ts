import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  suppliesSelect: vi.fn(),
  suppliesEq: vi.fn(),
  suppliesOr: vi.fn(),
  financeSelect: vi.fn(),
  financeIn: vi.fn(),
  financeOrder: vi.fn(),
  financeRange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

import { getOperationalAttentionMetrics } from "./orderRepository";

describe("getOperationalAttentionMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const suppliesQuery = {
      select: mocks.suppliesSelect,
      eq: mocks.suppliesEq,
      or: mocks.suppliesOr,
    };
    const financeQuery = {
      select: mocks.financeSelect,
      in: mocks.financeIn,
      order: mocks.financeOrder,
      range: mocks.financeRange,
    };
    Object.values(suppliesQuery).forEach(mock =>
      mock.mockReturnValue(suppliesQuery)
    );
    Object.values(financeQuery).forEach(mock =>
      mock.mockReturnValue(financeQuery)
    );
    mocks.from.mockImplementation((table: string) =>
      table === "os_orders" ? suppliesQuery : financeQuery
    );
    mocks.suppliesOr.mockReturnValueOnce(suppliesQuery).mockResolvedValueOnce({
      count: 3,
      error: null,
    });
    mocks.financeRange.mockResolvedValue({ data: [], error: null });
  });

  it("counts only current, unarchived and unfinished awaiting-supplies orders", async () => {
    const result = await getOperationalAttentionMetrics();

    expect(mocks.suppliesSelect).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mocks.suppliesEq).toHaveBeenCalledWith(
      "production_tag",
      "AGUARDANDO_INSUMOS"
    );
    expect(mocks.suppliesOr).toHaveBeenCalledWith(
      "archived.is.null,archived.eq.false"
    );
    expect(mocks.suppliesOr).toHaveBeenCalledWith(
      "prod_status.is.null,prod_status.not.ilike.%finaliz%"
    );
    expect(result.awaitingSupplies).toBe(3);
  });

  it("queries every actionable status and counts distinct OS", async () => {
    mocks.financeRange.mockResolvedValueOnce({
      data: [
        {
          id: "1",
          os_id: "os-a",
          status: "AWAITING_PROOF",
          installment_no: 2,
          total_installments: 2,
        },
        {
          id: "3",
          os_id: "os-b",
          status: "REJEITADO",
          installment_no: 1,
          total_installments: 1,
        },
        {
          id: "4",
          os_id: "os-c",
          status: "CADASTRO_PENDENTE",
          installment_no: 1,
          total_installments: 1,
        },
      ],
      error: null,
    });

    const result = await getOperationalAttentionMetrics();

    expect(mocks.financeIn).toHaveBeenCalledWith("status", [
      "AWAITING_PROOF",
      "CADASTRO_PENDENTE",
      "REJEITADO",
    ]);
    expect(mocks.financeIn.mock.calls[0][1]).not.toContain("CONCILIADO");
    expect(mocks.financeIn.mock.calls[0][1]).not.toContain("LANCADO");
    expect(result.financePending).toBe(3);
  });

  it("paginates beyond 1000 rows with deterministic id ordering", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      os_id: `os-${index}`,
      status: "AWAITING_PROOF",
      installment_no: 2,
      total_installments: 2,
    }));
    mocks.financeRange
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [
          {
            id: "1000",
            os_id: "os-1000",
            status: "REJEITADO",
            installment_no: 1,
            total_installments: 1,
          },
        ],
        error: null,
      });

    const result = await getOperationalAttentionMetrics();

    expect(mocks.financeOrder).toHaveBeenNthCalledWith(1, "id", {
      ascending: true,
    });
    expect(mocks.financeOrder).toHaveBeenNthCalledWith(2, "id", {
      ascending: true,
    });
    expect(mocks.financeRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mocks.financeRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(result.financePending).toBe(1001);
  });
});
