import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, auth: { getUser: vi.fn() }, rpc: vi.fn() } }));
import { completeOrderDeadline, removeOrderAssignee, removeOrderDeadline, removeOrderItem, reopenOrderDeadline, setOrderAssignee, updateOrderItemIfUnchanged, updateOrderCommentIfUnchanged } from "./orderDetailRepository";
const orderId = "11111111-1111-4111-8111-111111111111"; const rowId = "22222222-2222-4222-8222-222222222222";
describe("order detail mutations", () => {
  beforeEach(() => mocks.from.mockReset());
  it("sets and removes an assignee without sentinel UUIDs", async () => { const single = vi.fn().mockResolvedValue({ data: { id: rowId }, error: null }); const select = vi.fn(() => ({ single })); const upsert = vi.fn(() => ({ select })); const eqScope = vi.fn().mockResolvedValue({ error: null }); const eqOrder = vi.fn(() => ({ eq: eqScope })); const del = vi.fn(() => ({ eq: eqOrder })); mocks.from.mockReturnValueOnce({ upsert }); await setOrderAssignee(orderId, "ART", rowId); expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: rowId }), expect.anything()); mocks.from.mockReturnValueOnce({ delete: del }); await removeOrderAssignee(orderId, "ART"); expect(eqScope).toHaveBeenCalledWith("scope", "ART"); });
  it("completes, reopens and removes deadlines", async () => { const single = vi.fn().mockResolvedValue({ data: {}, error: null }); const select = vi.fn(() => ({ single })); const eqScope = vi.fn(() => ({ select })); const eqOrder = vi.fn(() => ({ eq: eqScope })); const update = vi.fn(() => ({ eq: eqOrder })); mocks.from.mockReturnValueOnce({ update }); await completeOrderDeadline(orderId, "PRODUCTION"); expect(update.mock.calls[0][0].completed_at).toEqual(expect.any(String)); mocks.from.mockReturnValueOnce({ update }); await reopenOrderDeadline(orderId, "PRODUCTION"); expect(update).toHaveBeenLastCalledWith({ completed_at: null }); const removeScope = vi.fn().mockResolvedValue({ error: null }); mocks.from.mockReturnValueOnce({ delete: () => ({ eq: () => ({ eq: removeScope }) }) }); await removeOrderDeadline(orderId, "PRODUCTION"); expect(removeScope).toHaveBeenCalledWith("scope", "PRODUCTION"); });
  it("edits only the exact item version originally opened", async () => {
    const stamp = "2026-10-16T10:30:00.123456+00:00";
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: rowId, name: "Nova placa", updated_at: "2026-10-16T10:32:00.000000+00:00" }, error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const is = vi.fn(() => ({ select }));
    const secondEq = vi.fn(() => ({ is }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    mocks.from.mockReturnValueOnce({ update });

    const updated = await updateOrderItemIfUnchanged(rowId, { name: "Nova placa" }, stamp);
    expect(updated.name).toBe("Nova placa");
    expect(mocks.from).toHaveBeenCalledWith("os_order_items");
    expect(update).toHaveBeenCalledWith({ name: "Nova placa" });
    expect(firstEq).toHaveBeenCalledWith("id", rowId);
    expect(secondEq).toHaveBeenCalledWith("updated_at", stamp);
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(select).toHaveBeenCalledOnce();
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("refuses a stale edit when the atomic conditional update matches zero rows", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.from.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle }) }) }) }) }),
    });
    await expect(updateOrderItemIfUnchanged(
      rowId,
      { name: "Edição antiga" },
      "2026-10-16T10:30:00.123456+00:00"
    )).rejects.toThrow("alterado por outra pessoa ou não está mais disponível");
  });

  it("propagates genuine permission errors instead of misclassifying them as conflicts", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Permissão negada" },
    });
    mocks.from.mockReturnValueOnce({
      update: () => ({ eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle }) }) }) }) }),
    });
    await expect(updateOrderItemIfUnchanged(
      rowId, { name: "Novo texto" }, "2026-10-16T10:30:00.123456+00:00"
    )).rejects.toThrow("Permissão negada");
  });

  it("edits comments only when the version seen by the author still matches", async () => {
    const openedAt = "2026-10-16T11:30:00.123456+00:00";
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: rowId, message: "Novo texto", updated_at: "2026-10-16T11:35:00+00:00" },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const is = vi.fn(() => ({ select }));
    const versionEq = vi.fn(() => ({ is }));
    const idEq = vi.fn(() => ({ eq: versionEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    mocks.from.mockReturnValueOnce({ update });
    const result = await updateOrderCommentIfUnchanged(rowId, "  Novo texto  ", openedAt);
    expect(result.message).toBe("Novo texto");
    expect(mocks.from).toHaveBeenCalledWith("os_order_comments");
    expect(update).toHaveBeenCalledWith({ message: "Novo texto" });
    expect(idEq).toHaveBeenCalledWith("id", rowId);
    expect(versionEq).toHaveBeenCalledWith("updated_at", openedAt);
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(select).toHaveBeenCalledOnce();
  });

  it("rejects stale or removed comments without overwriting the newer message", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({
      eq: () => ({ eq: () => ({ is: () => ({ select: () => ({ maybeSingle }) }) }) }),
    }));
    mocks.from.mockReturnValueOnce({ update });
    await expect(updateOrderCommentIfUnchanged(
      rowId, "Meu rascunho", "2026-10-16T11:30:00+00:00"
    )).rejects.toThrow("alterado, removido ou está indisponível");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("propagates database permissions errors without claiming a version conflict", async () => {
    mocks.from.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ eq: () => ({
          is: () => ({ select: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "Acesso negado" } }),
          }) }),
        }) }),
      }),
    });
    await expect(updateOrderCommentIfUnchanged(
      rowId, "Comentário", "2026-10-16T11:30:00+00:00"
    )).rejects.toThrow("Acesso negado");
  });

  it("rejects invalid revision timestamps before issuing a database update", async () => {
    await expect(updateOrderCommentIfUnchanged(rowId, "Comentário", "versao-antiga"))
      .rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("soft deletes items", async () => { const eq = vi.fn().mockResolvedValue({ error: null }); const update = vi.fn(() => ({ eq })); mocks.from.mockReturnValue({ update }); await removeOrderItem(rowId); expect(update.mock.calls[0][0].deleted_at).toEqual(expect.any(String)); expect(eq).toHaveBeenCalledWith("id", rowId); });
});
