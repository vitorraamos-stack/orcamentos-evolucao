import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { changeOrderAssigneeIfUnchanged, changeOrderDeadlineIfUnchanged } from "./orderDetailRepository";

const orderId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const version = "2026-10-16T14:00:00.123456+00:00";
const sql = readFileSync(new URL("../../../../docs/tasks/os-management-concurrency-proposed.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");
const responsible = readFileSync(new URL("../components/OrderAssigneesCard.tsx", import.meta.url), "utf8");
const deadlines = readFileSync(new URL("../components/OrderDeadlinesCard.tsx", import.meta.url), "utf8");

describe("management card optimistic concurrency", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("assigns with the revision displayed to the manager", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { user_id: userId, updated_at: version }, error: null });
    await expect(changeOrderAssigneeIfUnchanged(orderId, "GENERAL", userId, version)).resolves.toMatchObject({ user_id: userId });
    expect(mocks.rpc).toHaveBeenCalledWith("hub_os_set_assignee_if_current", {
      p_os_id: orderId, p_scope: "GENERAL", p_user_id: userId, p_expected_updated_at: version,
    });
  });

  it("creates only from expected absence, and removes only from the known revision", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await changeOrderAssigneeIfUnchanged(orderId, "ART", userId, null);
    await changeOrderAssigneeIfUnchanged(orderId, "ART", null, version);
    expect(mocks.rpc.mock.calls[0][1].p_expected_updated_at).toBeNull();
    expect(mocks.rpc.mock.calls[1][1].p_user_id).toBeNull();
    expect(mocks.rpc.mock.calls[1][1].p_expected_updated_at).toBe(version);
  });

  it("passes dated and undated deadline actions with their original scoped revisions", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: userId, due_date: "2026-10-29" }, error: null });
    await changeOrderDeadlineIfUnchanged(orderId, "ART", "set", null, "2026-10-29");
    await changeOrderDeadlineIfUnchanged(orderId, "ART", "complete", version);
    await changeOrderDeadlineIfUnchanged(orderId, "ART", "reopen", version);
    await changeOrderDeadlineIfUnchanged(orderId, "ART", "remove", version);
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
    expect(mocks.rpc.mock.calls.map(call => call[1].p_action)).toEqual(["set","complete","reopen","remove"]);
    expect(mocks.rpc.mock.calls.map(call => call[1].p_due_date)).toEqual(["2026-10-29",null,null,null]);
    expect(mocks.rpc.mock.calls[0][1].p_expected_updated_at).toBeNull();
    expect(mocks.rpc.mock.calls.slice(1).every(call => call[1].p_expected_updated_at === version)).toBe(true);
  });

  it("keeps database authorization, absent RPC, and conflict errors visible without fallback", async () => {
    for (const errorMessage of [
      "O responsável desta etapa foi alterado.",
      "A meta desta etapa foi alterada.",
      "Apenas gerente/admin podem alterar prazos.",
      "Could not find the function hub_os_set_assignee_if_current",
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: errorMessage } });
      await expect(changeOrderAssigneeIfUnchanged(orderId, "ART", userId, version))
        .rejects.toThrow(errorMessage);
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });

  it("validates versions, UUIDs and due dates before calling the database", async () => {
    await expect(changeOrderAssigneeIfUnchanged(orderId, "ART", userId, "not-a-date")).rejects.toThrow();
    await expect(changeOrderAssigneeIfUnchanged(orderId, "ART", "not-a-uuid", null)).rejects.toThrow();
    await expect(changeOrderDeadlineIfUnchanged(orderId, "ART", "set", null, "31-10-2026")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("server proposal serializes absence, locks existing children and audits transactionally", () => {
    expect(sql).toContain("perform 1 from public.os_orders o where o.id = p_os_id for update");
    expect(sql).toContain("perform 1 from public.os_orders o where o.id=p_os_id for update");
    expect((sql.match(/for update;/g) ?? []).length).toBe(4); // Parent and child row in each of two RPCs
    expect(sql).toContain("v_existing.updated_at is distinct from p_expected_updated_at");
    expect(sql).toContain("not v_found and p_expected_updated_at is not null");
    expect(sql).toContain("insert into public.os_orders_event");
    expect(sql).toContain("v_role not in ('admin', 'gerente')");
    expect(sql).toContain("from public,anon,authenticated;");
    expect(sql).toContain("to authenticated;");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("security definer");
  });

  it("only edits Resumo, captures the displayed scope version and retains drafts on conflict", () => {
    expect((page.match(/aria-label="Responsáveis e prazos"/g) ?? []).length).toBe(1);
    expect(page).toContain("changeOrderAssigneeIfUnchanged(");
    expect(page).toContain("changeOrderDeadlineIfUnchanged(");
    expect(page).not.toContain('await event("assignee_changed"');
    expect(page).not.toContain('await event("deadline_changed"');
    expect(responsible).toContain("assignee?.updated_at ?? null");
    expect(responsible).toContain('role="alert"');
    expect(deadlines).toContain("setEditVersion(deadline?.updated_at ?? null)");
    expect(deadlines).toContain("const saved = await run(scope, () => onChange(scope, draftDate, editVersion))");
    expect(deadlines).toContain("if (saved) {");
    expect(deadlines).toContain("version: deadline.updated_at");
    expect(deadlines).toContain("if (removed) setRemoving(null)");
    expect(deadlines).toContain("Atualize a OS");
  });
});
