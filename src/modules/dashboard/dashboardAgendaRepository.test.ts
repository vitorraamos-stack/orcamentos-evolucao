import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { listDashboardAgendaSources } from "./dashboardAgendaRepository";

function query(rows: Array<Record<string, unknown>>, count = rows.length) {
  const q = {
    select: vi.fn(), in: vi.fn(), eq: vi.fn(), order: vi.fn(),
    range: vi.fn(), abortSignal: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.in.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.abortSignal.mockReturnValue(q);
  q.range.mockImplementation(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1), count, error: null,
  }));
  q.eq.mockResolvedValue({ data: rows, error: null });
  return q;
}
const access = {
  userId: "me", isManager: true,
  canViewInstallations: true, canViewDeliveries: true,
};
const installation = (id: string, team_id: string | null, responsible_id: string | null) => ({
  id, os_id: "os-" + id, team_id, responsible_id,
  status: "SCHEDULED", scheduled_start: "2026-11-06T12:00:00Z",
  scheduled_end: null, estimated_duration_minutes: null, address_snapshot: "Rua A",
});
const delivery = (id: string) => ({
  id, os_id: "os-" + id, status: "SCHEDULED",
  mode: "OWN_DELIVERY", assigned_to: "driver", scheduled_at: "2026-11-06T12:00:00Z",
});

describe("Dashboard Etapa 2 — repositório, autorização e paginação", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not query logistics when permissions deny both modules", async () => {
    expect(await listDashboardAgendaSources({
      ...access, canViewInstallations: false, canViewDeliveries: false,
    })).toEqual({
      installations: [], deliveries: [], canViewInstallations: false, canViewDeliveries: false,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("paginates all RLS-visible records instead of hiding entries after a fixed limit", async () => {
    const ins = query(Array.from({ length: 501 }, (_, i) => installation(String(i), "t", null)));
    const del = query([delivery("one")]);
    mocks.from.mockImplementation((table: string) => {
      if (table === "os_installations") return ins;
      if (table === "os_deliveries") return del;
      throw Error("Unexpected table: " + table);
    });
    const result = await listDashboardAgendaSources(access);
    expect(result.installations).toHaveLength(501);
    expect(result.deliveries).toHaveLength(1);
    expect(ins.range).toHaveBeenCalledTimes(2);
    expect(ins.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(mocks.from).not.toHaveBeenCalledWith("os_installation_team_members");
  });

  it("limits non-manager installation visibility to responsible person and own team", async () => {
    const ins = query([
      installation("mine-team", "team-me", "other"),
      installation("mine-person", "team-other", "me"),
      installation("foreign", "team-other", "other"),
    ]);
    const member = query([{ team_id: "team-me" }]);
    mocks.from.mockImplementation((table: string) => {
      if (table === "os_installations") return ins;
      if (table === "os_installation_team_members") return member;
      throw Error("Unexpected table: " + table);
    });
    const result = await listDashboardAgendaSources({
      ...access, isManager: false, canViewDeliveries: false,
    });
    expect(result.installations.map(row => row.id)).toEqual(["mine-team", "mine-person"]);
    expect(member.eq).toHaveBeenCalledWith("user_id", "me");
    expect(mocks.from).not.toHaveBeenCalledWith("os_deliveries");
  });

  it("rejects unverifiable page totals rather than displaying a false zero", async () => {
    const ins = query([]);
    ins.range.mockResolvedValue({ data: [], count: null, error: null });
    mocks.from.mockReturnValue(ins);
    await expect(listDashboardAgendaSources({
      ...access, canViewDeliveries: false,
    })).rejects.toThrow("contagem da agenda");
  });
});
