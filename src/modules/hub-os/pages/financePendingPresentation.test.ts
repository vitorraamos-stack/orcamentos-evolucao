import { describe, expect, it } from "vitest";
import type { FinanceInstallment } from "@/features/hubos/types";
import {
  parseFinanceNoteHistory,
  sortFinancePendingItems,
  type FinancePendingItem,
} from "./financePendingPresentation";

const item = (
  key: string,
  group: FinancePendingItem["group"],
  dueDate: string | null,
  createdAt: string
): FinancePendingItem => ({
  key,
  group,
  value: {
    id: key,
    os_id: `os-${key}`,
    installment_no: 2,
    total_installments: 2,
    due_date: dueDate,
    asset_id: null,
    status:
      group === "rejected"
        ? "REJEITADO"
        : group === "registration"
          ? "CADASTRO_PENDENTE"
          : "AWAITING_PROOF",
    notes: null,
    created_at: createdAt,
    reviewed_at: null,
    reviewed_by: null,
  } satisfies FinanceInstallment,
});

describe("sortFinancePendingItems", () => {
  const now = new Date("2026-10-02T12:00:00");

  it("orders operational priority from rejected through future installments", () => {
    const result = sortFinancePendingItems(
      [
        item("future", "second_installment", "2026-10-05", "2026-09-01"),
        item("registration", "registration", null, "2026-09-01"),
        item("today", "second_installment", "2026-10-02", "2026-09-01"),
        item("overdue", "second_installment", "2026-10-01", "2026-09-01"),
        item("rejected", "rejected", null, "2026-09-01"),
      ],
      "priority",
      now
    );

    expect(result.map(entry => entry.key)).toEqual([
      "rejected",
      "overdue",
      "today",
      "registration",
      "future",
    ]);
  });

  it("uses the oldest canonical created_at and then key as deterministic ties", () => {
    const result = sortFinancePendingItems(
      [
        item("c", "rejected", null, "2026-09-02"),
        item("b", "rejected", null, "2026-09-01"),
        item("a", "rejected", null, "2026-09-01"),
      ],
      "priority",
      now
    );

    expect(result.map(entry => entry.key)).toEqual(["a", "b", "c"]);
  });
});

describe("parseFinanceNoteHistory", () => {
  it("parses Financeiro and Consultor history entries", () => {
    const result = parseFinanceNoteHistory(
      "[01/10/2026, 09:30:00] FINANCEIRO • Rejeitado\nDocumento ilegível\n\n[02/10/2026, 10:00:00] CONSULTOR • Ajuste concluído\nNovo arquivo enviado"
    );

    expect(result.fallback).toBeNull();
    expect(result.entries).toEqual([
      expect.objectContaining({
        actor: "FINANCEIRO",
        status: "Rejeitado",
        body: "Documento ilegível",
      }),
      expect.objectContaining({
        actor: "CONSULTOR",
        status: "Ajuste concluído",
        body: "Novo arquivo enviado",
      }),
    ]);
  });

  it("preserves all legacy content when any block is not recognized", () => {
    const legacy = "Observação antiga sem cabeçalho\ncom uma segunda linha";
    expect(parseFinanceNoteHistory(legacy)).toEqual({
      entries: [],
      fallback: legacy,
    });
  });
});
