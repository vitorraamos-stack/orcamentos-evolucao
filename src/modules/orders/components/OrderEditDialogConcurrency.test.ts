import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(new URL("./OrderEditDialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../repositories/orderDetailRepository.ts", import.meta.url), "utf8");

describe("OS general details — edit session revision and draft preservation", () => {
  it("captures revision on open, not on each background refresh", () => {
    expect(editor).toContain("setOpenedUpdatedAt(order.updated_at)");
    expect(editor).toContain("[open, order.id]");
    expect(editor).not.toContain("[order]\n");
    expect(editor).toContain("if (!open) return;");
  });

  it("passes the snapshot through the page and repository to the guarded RPC", () => {
    expect(editor).toContain("await onSave(value, openedUpdatedAt)");
    expect(page).toContain("updateOrderOperationalFields(detail.order.id, input, expectedUpdatedAt)");
    expect(repository).toContain('supabase.rpc("hub_os_update_order_if_current"');
    expect(repository).toContain("p_expected_updated_at: expected");
    expect(repository).not.toContain('supabase.rpc("hub_os_update_order_secure", {\n    p_os_id: orderId');
  });

  it("does not close or erase the editing draft after a version conflict", () => {
    const saveStart = editor.indexOf("await onSave(value, openedUpdatedAt)");
    const catchStart = editor.indexOf("} catch (error) {", saveStart);
    const finallyStart = editor.indexOf("} finally {", catchStart);
    expect(saveStart).toBeGreaterThan(-1);
    expect(catchStart).toBeGreaterThan(saveStart);
    expect(finallyStart).toBeGreaterThan(catchStart);
    expect(editor.slice(catchStart, finallyStart)).toContain("setSaveError(");
    expect(editor.slice(catchStart, finallyStart)).not.toContain("onOpenChange(false)");
    expect(editor).toContain('role="alert"');
    expect(editor).toContain("if (!saving) onOpenChange(nextOpen)");
  });

  it("preserves manager permissions and the existing audit action name", () => {
    expect(page).toContain("canEditOrder = hubPermissions.isManager");
    expect(page).toContain("toast.success(\"OS atualizada.\")");
    expect(repository).toContain('p_event_type: "details_updated"');
    expect(repository).toContain("p_event_payload: { fields: Object.keys(input) }");
  });
});
