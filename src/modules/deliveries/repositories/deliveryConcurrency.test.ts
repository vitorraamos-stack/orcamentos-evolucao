import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { updateDelivery } from "./deliveriesRepository";

const id = "11111111-1111-4111-8111-111111111111";
const ts = "2026-10-16T14:20:00.123456+00:00";
const data = {
  scheduledAt: "2026-10-17T14:00:00.000Z",
  assignedTo: null,
  vehicleLabel: "Van",
  carrierName: null,
  trackingCode: null,
  notes: "Separar volumes",
};
const sql = readFileSync(new URL("../../../../docs/tasks/os-delivery-edit-concurrency-proposed.sql", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/DeliveryScheduleDialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/DeliveriesPage.tsx", import.meta.url), "utf8");

describe("EvoluSystem delivery edit revision contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("updates using the exact revision opened in the dialog", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await updateDelivery(id, data, ts);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("hub_os_update_delivery_if_current", {
      p_delivery_id: id,
      p_expected_updated_at: ts,
      p_scheduled_at: data.scheduledAt,
      p_assigned_to: null,
      p_vehicle_label: "Van",
      p_carrier_name: null,
      p_tracking_code: null,
      p_notes: "Separar volumes",
    });
  });

  it("fails closed when the database reports a conflict", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "Entrega alterada por outro colaborador" } });
    await expect(updateDelivery(id, data, ts)).rejects.toThrow("Entrega alterada por outro colaborador");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][0]).toBe("hub_os_update_delivery_if_current");
  });

  it("never submits an absent or invalid revision", async () => {
    await expect(updateDelivery(id, data, "")).rejects.toThrow();
    await expect(updateDelivery(id, data, "not-a-date")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves legacy secure transitions while adding one conditional wrapper", () => {
    expect(sql).toContain("public.hub_os_assert_logistics_actor('DELIVERY')");
    expect(sql).toContain("where d.id = p_delivery_id for update;");
    expect(sql).toContain("v_updated_at is distinct from p_expected_updated_at");
    expect(sql).toContain("return public.hub_os_update_delivery_secure(");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("from public,anon,authenticated;");
    expect(sql).toContain("to authenticated;");
    expect(sql).not.toMatch(/\balter table\b|\bdrop function\b|\bdelete from\b/i);
  });

  it("passes the selected delivery revision and preserves new-delivery scheduling", () => {
    expect(page).toContain('updateDelivery(editing.id, input, editing.updated_at ?? "")');
    expect(page).toContain("else await scheduleDelivery(input)");
    expect(page).toContain("await deliveryAction(action, delivery.id, extra)");
  });

  it("keeps entered values on errors and prevents duplicate submissions", () => {
    expect(dialog).toContain('setSaveError(cause instanceof Error');
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain('if (busy) return;');
    expect(dialog).toContain('if (busy && !next) return;');
    expect(dialog).toContain('setBusy(false);');
    expect(dialog).toContain('setSaveError(null);');
    expect(dialog).toContain('onOpenChange(false);');
  });
});
