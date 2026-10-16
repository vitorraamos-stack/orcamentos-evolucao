import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { setChecklistItem } from "./installationExecutionRepository";
import type { InstallationChecklistItem } from "../types";

const revision = "2026-10-16T20:00:00.123456+00:00";
const item = {
  id: "11111111-1111-4111-8111-111111111111",
  updated_at: revision,
  note: "Conferido pelo instalador",
  status: "PENDING",
} as InstallationChecklistItem;
const rpc = "hub_os_set_installation_checklist_item_if_current";
const sql = readFileSync(
  new URL("../../../../docs/tasks/os-installation-checklist-concurrency-proposed.sql", import.meta.url),
  "utf8"
);
const page = readFileSync(new URL("../pages/InstallationExecutionPage.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/InstallationChecklist.tsx", import.meta.url), "utf8");

describe("installation checklist concurrency contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("submits exactly the opened item revision and preserves its note", async () => {
    const saved = { ...item, status: "DONE", updated_at: "2026-10-16T20:05:00.000Z" };
    mocks.rpc.mockResolvedValueOnce({ data: saved, error: null });
    await expect(setChecklistItem(item, "DONE")).resolves.toEqual(saved);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, {
      p_item_id: item.id,
      p_expected_updated_at: revision,
      p_status: "DONE",
      p_note: "Conferido pelo instalador",
    });
  });

  it("preserves nullable notes while toggling back to pending", async () => {
    const clearNote = { ...item, note: null };
    mocks.rpc.mockResolvedValueOnce({ data: clearNote, error: null });
    await setChecklistItem(clearNote, "PENDING");
    expect(mocks.rpc.mock.calls[0][1].p_note).toBeNull();
    expect(mocks.rpc.mock.calls[0][1].p_status).toBe("PENDING");
  });

  it("fails closed on conflict or missing new RPC, without calling legacy", async () => {
    for (const error of [
      { code: "P0001", message: "Checklist modificado em outra sessão" },
      { code: "PGRST202", message: "RPC not found" },
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error });
      await expect(setChecklistItem(item, "NOT_APPLICABLE")).rejects.toThrow(error.message);
    }
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([rpc, rpc]);
  });

  it("rejects revisions missing from old fixtures before the database call", async () => {
    await expect(setChecklistItem({ ...item, updated_at: "" }, "DONE")).rejects.toThrow();
    await expect(setChecklistItem({ ...item, updated_at: "not-a-date" }, "DONE")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the same lock order, executor check and protected update", () => {
    for (const fragment of [
      "public.hub_os_assert_installation_executor(v_installation, false)",
      "from public.os_installation_checklist_items",
      "where id = p_item_id",
      "from public.os_installations",
      "where id = v_item.installation_id",
      "v_item.updated_at is distinct from p_expected_updated_at",
      "return public.hub_os_set_installation_checklist_item_secure(",
      "set search_path = ''",
      "from public, anon, authenticated;",
      "to authenticated;",
    ]) expect(sql).toContain(fragment);
    expect((sql.match(/for update;/g) ?? []).length).toBe(2);
    expect((sql.match(/create or replace function public\.hub_os_set_installation_checklist_item_if_current\(/g) ?? []).length).toBe(1);
    expect(sql).not.toMatch(/^\s*(?:alter table|drop table|insert into|delete from|truncate)/im);
  });

  it("blocks duplicate UI actions and refreshes after conflicts", () => {
    expect(page).toContain("if (checklistSaveRef.current) return");
    expect(page).toContain("await setChecklistItem(item, status)");
    expect(page).toContain("await load()");
    expect(page).toContain("savingItemId={savingChecklistItemId}");
    expect(page).toContain("savingChecklistItemId !== null");
    expect(component).toContain("disabled={readOnly || savingItemId !== null}");
    expect(component).toContain("disabled={savingItemId !== null}");
    expect(component).toContain('role="status">Salvando…');
  });
});
