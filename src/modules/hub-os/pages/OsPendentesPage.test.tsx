import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcilePendingSelection } from "./osPendentesSelection";

const source = readFileSync(
  new URL("./OsPendentesPage.tsx", import.meta.url),
  "utf8"
);

describe("reconcilePendingSelection", () => {
  it("preserves a selection that remains available after refresh", () => {
    expect(reconcilePendingSelection("second:a", ["second:a", "rejected:b"])).toBe(
      "second:a"
    );
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
    expect(source).toContain("onClick={() => selectItem(item.key)}");
    expect(source).not.toContain("setSelectedKey(current =>");
  });

  it("only renders a selected item from the visible list and remounts its file input", () => {
    expect(source).toContain(
      "const selected = visible.find(item => item.key === selectedKey) ?? null;"
    );
    expect(source).toContain("key={selected.key}");
    expect(source).toContain("Selecione uma OS para visualizar detalhes.");
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
    expect(source.match(/disabled=\{busy\}/g)?.length).toBeGreaterThanOrEqual(5);
    expect(source).toContain("disabled:opacity-60");
  });
});
