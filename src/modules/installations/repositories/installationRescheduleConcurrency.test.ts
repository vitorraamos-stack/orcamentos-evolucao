import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import { rescheduleInstallation } from "./installationsRepository";

const id = "11111111-1111-4111-8111-111111111111";
const team = "22222222-2222-4222-8222-222222222222";
const revision = "2026-10-16T19:00:00.123456+00:00";
const input = {
  scheduledStart: "2026-10-19T12:00:00.000Z",
  scheduledEnd: null, teamId: team, responsibleId: null,
  estimatedDurationMinutes: 180, vehicleLabel: "Van",
  notes: "Confirmar estrutura", overrideConflict: false,
};
const sql = readFileSync(new URL("../../../../docs/tasks/os-installation-reschedule-concurrency-proposed.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/InstallationsPage.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("../components/InstallationScheduleDialog.tsx", import.meta.url), "utf8");

describe("EvoluSystem installation reschedule concurrency", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("passes the originally opened revision with full existing scheduling fields", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id }, error: null });
    await rescheduleInstallation(id, input, revision);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("hub_os_reschedule_installation_if_current", {
      p_installation_id: id,
      p_expected_updated_at: revision,
      p_scheduled_start: input.scheduledStart,
      p_scheduled_end: null,
      p_team_id: team,
      p_responsible_id: null,
      p_estimated_duration_minutes: 180,
      p_vehicle_label: "Van",
      p_notes: "Confirmar estrutura",
      p_override_conflict: false,
    });
  });

  it("fails closed on stale revision and missing RPC without legacy fallback", async () => {
    for (const error of [
      { code: "P0001", message: "Instalação alterada por outro colaborador." },
      { code: "PGRST202", message: "Could not find hub_os_reschedule_installation_if_current" },
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error });
      await expect(rescheduleInstallation(id, input, revision)).rejects.toThrow(error.message);
    }
    expect(mocks.rpc.mock.calls.map(x => x[0])).toEqual([
      "hub_os_reschedule_installation_if_current",
      "hub_os_reschedule_installation_if_current",
    ]);
  });

  it("rejects invalid revisions before sending anything to Supabase", async () => {
    await expect(rescheduleInstallation(id, input, "")).rejects.toThrow();
    await expect(rescheduleInstallation(id, input, "invalid")).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("SQL checks manager access and revision under a row lock, delegating the original scheduling logic", () => {
    for (const rule of [
      "public.hub_os_assert_logistics_actor('INSTALLATION')",
      "where i.id = p_installation_id",
      "for update;",
      "v_updated_at is distinct from p_expected_updated_at",
      "public.hub_os_reschedule_installation_secure(",
      "set search_path = ''",
      "from public, anon, authenticated;",
      "to authenticated;",
    ]) expect(sql).toContain(rule);
    expect((sql.match(/create or replace function public\.hub_os_reschedule_installation_if_current\(/g) ?? []).length).toBe(1);
    expect(sql).not.toMatch(/^\s*(?:alter table|drop table|delete from|truncate)/im);
  });

  it("uses the original selected installation revision and preserves new scheduling", () => {
    expect(page).toContain("rescheduleInstallation(editing.id, input, editing.updated_at)");
    expect(page).toContain("else await scheduleInstallation(input)");
    expect(page).toContain('await installationAction("cancel", cancelling.id, reason)');
  });

  it("restores original duration and preserves form values on save failure", () => {
    expect(form).toContain("setDuration(String(installation?.estimated_duration_minutes ?? 120))");
    expect(form).toContain('role="alert"');
    expect(form).toContain("if (busy && !next) return;");
    expect(form).toContain("if (busy) return;");
    expect(form).toContain("setSaveError(cause instanceof Error");
    expect(form).toContain("onOpenChange(false);");
    expect(form).toContain("setBusy(false);");
  });
});
