import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcilePendingSelection } from "./osPendentesSelection";

const source = readFileSync(
  new URL("./OsPendentesPage.tsx", import.meta.url),
  "utf8"
);

describe("reconcilePendingSelection", () => {
  it("preserves a selection that remains available after refresh", () => {
    expect(
      reconcilePendingSelection("second:a", ["second:a", "rejected:b"])
    ).toBe("second:a");
  });

  it("selects the first available item when refresh removes the selection", () => {
    expect(reconcilePendingSelection("second:a", ["rejected:b"])).toBe(
      "rejected:b"
    );
  });

  it("reconciles a selection hidden by a filter or search", () => {
    expect(
      reconcilePendingSelection("second:a", ["rejected:b", "rejected:c"])
    ).toBe("rejected:b");
  });

  it("clears the selection when no item is visible", () => {
    expect(reconcilePendingSelection("second:a", [])).toBeNull();
  });
});

describe("OsPendentesPage context safety", () => {
  it("centralizes selection changes and clears both form fields", () => {
    expect(source).toContain("const selectItem = useCallback");
    expect(source).toContain("setFile(null);");
    expect(source).toContain('setNote("");');
    expect(source).toContain("onSelect={selectItem}");
    expect(source).toContain("onClick={() => onSelect(item.key)}");
    expect(source).not.toContain("setSelectedKey(current =>");
  });

  it("only renders a selected item from the visible list and remounts its file input", () => {
    expect(source).toContain(
      "const selected = visible.find(item => item.key === selectedKey) ?? null;"
    );
    expect(source).toContain("key={selected.key}");
    expect(source).toContain(
      "Ajuste a busca ou os filtros para selecionar uma pendência."
    );
  });

  it("guards actions by pending group", () => {
    expect(source).toContain('selected.group !== "second_installment"');
    expect(source).toContain(
      '(selected.group !== "registration" && selected.group !== "rejected")'
    );
    expect(source).toContain('status: "PENDING_REVIEW"');
    expect(source).not.toContain('fetchFinanceQueue(["PENDING_REVIEW"]');
  });

  it("locks every context control while an action is busy", () => {
    expect(source).toContain("disabled={busy || loading}");
    expect(source.match(/disabled=\{busy\}/g)?.length).toBeGreaterThanOrEqual(
      5
    );
    expect(source).toContain("disabled:opacity-60");
  });
});

describe("OsPendentesPage action-oriented presentation", () => {
  it("renders one concise empty state without queue search copy", () => {
    const emptyBranch = source.slice(
      source.indexOf("summary.totalOrders === 0 ? ("),
      source.indexOf("<SummaryCards")
    );
    expect(emptyBranch).toContain("Nenhuma pendência financeira");
    expect(emptyBranch).toContain(
      "O Comercial não possui nenhuma ação financeira pendente"
    );
    expect(emptyBranch).not.toContain("Buscar por OS ou cliente");
  });

  it("provides semantic summary filters and counted quick filters", () => {
    expect(source).toContain("function SummaryCards");
    expect(source).toContain("aria-pressed={filter === card.value}");
    expect(source).toContain("summary[option.summaryKey]");
    expect(source).toContain('label: "Pendências"');
    expect(source).toContain('label: "Rejeitados"');
  });

  it("supports local search, sorting and clearing the current view", () => {
    expect(source).toContain('placeholder="Buscar por OS ou cliente..."');
    expect(source).toContain('<SelectItem value="priority">Prioridade');
    expect(source).toContain("const clearViewFilters = () =>");
    expect(source).toContain("Limpar busca e filtros");
  });

  it("keeps a real file input and exposes selected-file removal", () => {
    expect(source).toContain('type="file"');
    expect(source).toContain('accept="image/*,application/pdf"');
    expect(source).toContain('fileInputRef.current.value = ""');
    expect(source).toContain("Enviar comprovante ao Financeiro");
    expect(source).toContain("Remover");
  });

  it("shows contextual actions for every pending group", () => {
    expect(source).toContain("O que precisa ser feito");
    expect(source).toContain("Cadastro corrigido → Reenviar ao Financeiro");
    expect(source).toContain("Ajuste concluído → Reenviar ao Financeiro");
    expect(source).toContain("MOTIVO DA REJEIÇÃO");
  });
});
