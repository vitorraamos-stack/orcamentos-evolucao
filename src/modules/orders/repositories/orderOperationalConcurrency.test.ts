import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { updateOrderOperationalFields } from "./orderDetailRepository";

const orderId = "11111111-1111-4111-8111-111111111111";
const originalVersion = "2026-10-16T13:05:00.123456+00:00";
const sql = readFileSync(
  new URL("../../../../docs/tasks/os-details-optimistic-lock-proposed.sql", import.meta.url),
  "utf8"
);

describe("EvoluSystem OS — general details optimistic concurrency", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("uses the new protected RPC with an explicit original revision and audited fields", async () => {
    const result = { id: orderId, title: "Letreiro revisado", updated_at: "2026-10-16T13:06:00+00:00" };
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });

    await expect(updateOrderOperationalFields(
      orderId,
      { title: "Letreiro revisado", is_urgent: true },
      originalVersion
    )).resolves.toEqual(result);

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "hub_os_update_order_if_current",
      {
        p_os_id: orderId,
        p_patch: { title: "Letreiro revisado", is_urgent: true },
        p_expected_updated_at: originalVersion,
        p_event_type: "details_updated",
        p_event_payload: { fields: ["title", "is_urgent"] },
      }
    );
  });

  it("does not downgrade to an unguarded update after a version conflict", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Esta OS foi alterada por outro colaborador.", code: "P0001" },
    });
    await expect(updateOrderOperationalFields(orderId, { title: "Meu rascunho" }, originalVersion))
      .rejects.toThrow("alterada por outro colaborador");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe("hub_os_update_order_if_current");
  });

  it("fails closed if the database function is not deployed yet", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the function hub_os_update_order_if_current in the schema cache", code: "PGRST202" },
    });
    await expect(updateOrderOperationalFields(orderId, { title: "Novo" }, originalVersion))
      .rejects.toThrow("Could not find the function");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid original versions before issuing any RPC", async () => {
    await expect(updateOrderOperationalFields(orderId, { title: "Novo" }, "sem-versao"))
      .rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires server-side lock, exact revision, manager authorization and event delegation", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("public.hub_os_assert_orders_access()");
    expect(sql).toContain("v_role not in ('admin', 'gerente')");
    expect(sql).toContain("for update;");
    expect(sql).toContain("v_current_updated_at is distinct from p_expected_updated_at");
    expect(sql.indexOf("for update;")).toBeLessThan(sql.indexOf("v_current_updated_at is distinct"));
    expect(sql).toContain("return public.hub_os_update_order_secure(");
    expect(sql).toContain("from public, anon, authenticated;");
    expect(sql).toContain("to authenticated;");
    expect(sql).not.toContain("grant execute on function public.hub_os_update_order_if_current(uuid,jsonb,timestamptz,text,jsonb)\n  to anon;");
  });
});
