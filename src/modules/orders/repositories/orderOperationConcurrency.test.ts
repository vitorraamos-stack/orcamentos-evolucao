import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { updateItemOperation, setItemOperationStatus, deleteItemOperation } from "./orderDetailRepository";

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const version = "2026-10-16T14:20:00.123456+00:00";
const sql = readFileSync(new URL("../../../../docs/tasks/os-production-operation-concurrency-proposed.sql", import.meta.url), "utf8");
const tab = readFileSync(new URL("../components/OrderProductionTab.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");

describe("EvoluSystem production operations — versioned mutations", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("updates only the revision opened by the collaborator", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await updateItemOperation(id, {
      workCenter: "ASSEMBLY", assignedTo: userId, isRequired: true,
      notes: "Conferir", sortOrder: 2,
    }, version);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("hub_os_update_item_operation_if_current", {
      p_operation_id: id, p_expected_updated_at: version, p_work_center: "ASSEMBLY",
      p_assigned_to: userId, p_is_required: true, p_notes: "Conferir", p_sort_order: 2,
    });
  });

  it("guards ordinary status changes and blocking with the displayed timestamp", async () => {
    mocks.rpc.mockResolvedValue({ data: { id }, error: null });
    await setItemOperationStatus(id, "IN_PROGRESS", version);
    await setItemOperationStatus(id, "BLOCKED", version, "Aguardando material");
    expect(mocks.rpc.mock.calls[0]).toEqual(["hub_os_set_item_operation_status_if_current", {
      p_operation_id: id, p_expected_updated_at: version,
      p_status: "IN_PROGRESS", p_blocked_reason: null, p_notes: null,
    }]);
    expect(mocks.rpc.mock.calls[1][1].p_blocked_reason).toBe("Aguardando material");
  });

  it("guards deletion using the originally displayed timestamp", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await deleteItemOperation(id, version);
    expect(mocks.rpc).toHaveBeenCalledWith("hub_os_delete_item_operation_if_current", {
      p_operation_id: id, p_expected_updated_at: version,
    });
  });

  it("rejects conflicts, database errors and missing RPCs without legacy fallback", async () => {
    for (const error of [
      { message: "Esta operação foi alterada por outro colaborador.", code: "P0001" },
      { message: "Could not find the function hub_os_update_item_operation_if_current", code: "PGRST202" },
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error });
      await expect(updateItemOperation(id, {
        workCenter: "PRINTING", assignedTo: null, isRequired: true, notes: "", sortOrder: 0,
      }, version)).rejects.toThrow(error.message);
    }
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "hub_os_update_item_operation_if_current",
      "hub_os_update_item_operation_if_current",
    ]);
  });

  it("rejects an invalid original timestamp without contacting the DB", async () => {
    await expect(deleteItemOperation(id, "sem-versao")).rejects.toThrow();
    await expect(setItemOperationStatus(id, "COMPLETED", "sem-versao")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("SQL locks an active operation, compares the revision and delegates rules and audit", () => {
    for (const part of [
      "public.hub_os_assert_operation_access()",
      "public.hub_os_assert_operation_access(true)",
      "v_updated_at is distinct from p_expected_updated_at",
      "public.hub_os_update_item_operation_secure(",
      "public.hub_os_set_item_operation_status_secure(",
      "public.hub_os_delete_item_operation_secure(",
      "set search_path = ''",
      "from public,anon,authenticated;",
    ]) expect(sql).toContain(part);
    expect((sql.match(/for update;/g) ?? []).length).toBe(3);
    expect((sql.match(/if v_updated_at is distinct from p_expected_updated_at/g) ?? []).length).toBe(3);
    expect((sql.match(/to authenticated;/g) ?? []).length).toBe(3);
  });

  it("the editor passes the captured version and keeps failure dialogs open", () => {
    expect(tab).toContain("onUpdate(editing.id, operationEditInput(draft), editing.updated_at)");
    expect(tab).toContain("onStatus(operation.id, action.status, operation.updated_at)");
    expect(tab).toContain('onStatus(blocking.id, "BLOCKED", blocking.updated_at, blockedReason.trim())');
    expect(tab).toContain("onDelete(deleting.id, deleting.updated_at)");
    expect(tab).toContain('failure?.kind === "edit"');
    expect(tab).toContain('failure?.kind === "block"');
    expect(tab).toContain('failure?.kind === "delete"');
    expect(tab).toContain("inFlight.current = true");
    expect(page).toContain("updateItemOperation(id,input,revision)");
    expect(page).toContain("setItemOperationStatus(id,status,revision,reason)");
    expect(page).toContain("deleteItemOperation(id,revision)");
  });
});
