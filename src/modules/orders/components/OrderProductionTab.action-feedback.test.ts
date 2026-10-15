import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runProductionAction } from "./OrderProductionTab";

const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");
const tab = readFileSync(new URL("./OrderProductionTab.tsx", import.meta.url), "utf8");

describe("OS production action feedback", () => {
  it("acknowledges successful mutations without showing an error", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const failure = vi.fn();
    expect(await runProductionAction(action, failure)).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
  });

  it("surfaces a rejected mutation and keeps the caller on the failure path", async () => {
    const failure = vi.fn();
    expect(await runProductionAction(() => Promise.reject(new Error("Permissão negada")), failure)).toBe(false);
    expect(failure).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("Permissão negada");
  });

  it("provides safe feedback for a non-Error rejection", async () => {
    const failure = vi.fn();
    expect(await runProductionAction(() => Promise.reject(null), failure)).toBe(false);
    expect(failure).toHaveBeenCalledWith("Não foi possível atualizar a operação.");
  });

  it("guards against duplicate submissions and leaves dialogs open on failure", () => {
    expect(tab).toContain("if (inFlight.current) return;");
    expect(tab).toContain("inFlight.current = true;");
    expect(tab).toContain("setPending(null);");
    expect(tab).toContain('failure?.kind === "create"');
    expect(tab).toContain('failure?.kind === "edit"');
    expect(tab).toContain('failure?.kind === "block"');
    expect(tab).toContain("await onCreate(");
    expect(tab).toContain("await onUpdate(");
    expect(tab).toContain("await onStatus(blocking.id,");
  });

  it("requires confirmation before deleting an operation", () => {
    expect(tab).toContain("<AlertDialog open={Boolean(deleting)}");
    expect(tab).toContain("Confirmar exclusão");
    expect(tab).toContain("await onDelete(deleting.id); setDeleting(null);");
  });

  it("does not claim a persisted write failed merely because refresh failed", () => {
    expect(page).toContain("const refreshProductionAfterWrite = async");
    expect(page).toContain("A alteração foi salva, mas não foi possível atualizar a lista.");
    for (const action of ["createItemOperation(input)", "updateItemOperation(id,input)", "setItemOperationStatus(id,status,reason)", "deleteItemOperation(id)"]) {
      expect(page).toContain("await " + action + "; await refreshProductionAfterWrite(");
    }
  });
});
