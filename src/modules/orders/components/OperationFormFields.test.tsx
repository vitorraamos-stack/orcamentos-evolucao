import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { UserOption } from "../types/orderDetail";
import type { OperationEditDraft } from "./OrderProductionTab";
import { OperationFormFields } from "./OperationFormFields";

const page = readFileSync(new URL("./OrderProductionTab.tsx", import.meta.url), "utf8");
const users: UserOption[] = [{ id: "user-1", name: "Equipe de Arte", email: null }];
const draft: OperationEditDraft = {
  workCenter: "PRINTING", assigned: "none", isRequired: true,
  notes: "Medidas confirmadas", sortOrder: 0,
};

const renderFields = () =>
  renderToStaticMarkup(<OperationFormFields draft={draft} users={users} setDraft={vi.fn()} />);

describe("EvoluSystem production operation forms", () => {
  it("links visible labels and controls with accessible names", () => {
    const html = renderFields();
    for (const label of ["Setor", "Responsável", "Operação obrigatória", "Observações"]) {
      expect(html).toContain(label);
    }
    expect((html.match(/data-slot="select-trigger"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-slot="checkbox"');
    expect(html).toContain("Conta para o progresso de conclusão do item.");
    expect(html).toContain("Medidas confirmadas");
    expect((html.match(/for="/g) ?? []).length).toBe(4);
    expect(html).toContain("aria-describedby=");
  });

  it("uses shared fields in both dialogs with item context and independent cancel actions", () => {
    expect((page.match(/<OperationFormFields draft={draft} users={users} setDraft={setDraft} \/>/g) ?? []).length).toBe(2);
    expect(page).toContain("items.find(item => item.id === createItemId)?.name");
    expect(page).toContain("items.find(item => item.id === editing?.item_id)?.name");
    expect(page).toContain("onClick={() => setCreateItemId(null)}>Cancelar</Button>");
    expect(page).toContain("onClick={() => setEditing(null)}>Cancelar</Button>");
    expect(page).toContain('max-h-[90dvh] overflow-y-auto sm:max-w-lg');
  });

  it("keeps original submission callbacks, status and permissions", () => {
    for (const action of [
      "onCreate({ itemId: createItemId, ...input })",
      "onUpdate(editing.id, operationEditInput(draft))",
      'onStatus(blocking.id, "BLOCKED", blockedReason.trim())',
      "onDelete(operation.id)",
      "canOperate &&", "canManage &&", "disabled={busy}",
    ]) expect(page).toContain(action);
  });
});
