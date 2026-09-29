import { describe, expect, it } from "vitest";
import {
  buildWazeUrl,
  buildMapsUrl,
  groupInstallationsByDay,
  isLegacyInstallation,
  isMyInstallation,
  isWaitingInstallation,
  getInstallationActions,
  installationOrderLabel,
  selectPrimaryInstallation,
  sortInstallationHistory,
  getInstallationDetails,
} from "./installations";
import type { Installation, LogisticsOrder } from "../types";
const order = {
  id: "o",
  sale_number: "1",
  client_name: "Cliente",
  delivery_date: null,
  address: "Rua A",
  address_lat: null,
  address_lng: null,
  logistic_type: "instalacao",
  prod_status: "Pronto / Avisar Cliente",
  archived: false,
  updated_at: "",
} satisfies LogisticsOrder;
describe("installation logistics domain", () => {
  it("builds Waze coordinate and address links", () => {
    expect(buildWazeUrl({ lat: -23, lng: -46 })).toContain("ll=-23%2C-46");
    expect(buildWazeUrl({ address: "Rua A" })).toContain("q=Rua+A");
  });
  it("prefers the textual address over automatic coordinates for navigation", () => {
    const input = {
      address: "Rua João Grumiche, 196 - Kobrasol - São José",
      lat: -27.596329,
      lng: -48.611681,
    };
    const maps = new URL(buildMapsUrl(input));
    const waze = new URL(buildWazeUrl(input));
    expect(maps.searchParams.get("query")).toBe(input.address);
    expect(maps.searchParams.get("query")).not.toContain("-27.596329");
    expect(waze.searchParams.get("q")).toBe(input.address);
    expect(waze.searchParams.get("ll")).toBeNull();
    expect(waze.searchParams.get("navigate")).toBe("yes");
  });
  it("groups using Sao Paulo calendar day", () => {
    const rows = [
      { id: "i", scheduled_start: "2026-10-01T02:00:00Z" },
    ] as Installation[];
    expect(Object.keys(groupInstallationsByDay(rows))).toEqual(["2026-09-30"]);
  });
  it("derives waiting and legacy without creating rows", () => {
    expect(isWaitingInstallation(order, new Set())).toBe(true);
    expect(
      isLegacyInstallation(
        { ...order, prod_status: "Instalação Agendada" },
        new Set()
      )
    ).toBe(true);
    expect(isWaitingInstallation(order, new Set(["o"]))).toBe(false);
  });
  it("matches responsible or team membership", () => {
    const row = { responsible_id: "u", team_id: "t" } as Installation;
    expect(isMyInstallation(row, "u", [])).toBe(true);
    expect(isMyInstallation(row, "x", ["t"])).toBe(true);
  });
  it("uses human order data and never falls back to the installation UUID", () => {
    const installation = {
      os_id: "cd795982-6189-47f6-a337-232c1a7e5107",
      order: { ...order, sale_number: "84756", client_name: "Vitor Teste 003" },
    } as Installation;
    expect(installationOrderLabel(installation)).toEqual({
      number: "84756",
      client: "Vitor Teste 003",
    });
    expect(
      installationOrderLabel({
        ...installation,
        order: { ...order, sale_number: null },
      }).number
    ).toBe("sem número");
  });
  it.each([
    ["instalador scheduled", "SCHEDULED", false, true, false],
    ["instalador in progress", "IN_PROGRESS", false, false, true],
    ["instalador completed", "COMPLETED", false, false, false],
    ["gerente scheduled", "SCHEDULED", true, true, true],
    ["gerente in progress", "IN_PROGRESS", true, false, true],
  ] as const)(
    "derives execution actions for %s",
    (_label, status, isManager, canStart, canComplete) => {
      expect(
        getInstallationActions({ status, isManager, canExecute: true })
      ).toMatchObject({ canStart, canComplete });
    }
  );
  it("sorts history by its terminal event and selects an active revisit", () => {
    const completed = {
      id: "old",
      status: "COMPLETED",
      completed_at: "2026-09-29T12:00:00Z",
      created_at: "2026-09-28T12:00:00Z",
      updated_at: "2026-09-29T12:00:00Z",
      scheduled_start: "2026-09-29T10:00:00Z",
    } as Installation;
    const cancelled = {
      ...completed,
      id: "new",
      status: "CANCELLED",
      completed_at: null,
      cancelled_at: "2026-09-29T13:00:00Z",
    } as Installation;
    const revisit = {
      ...completed,
      id: "active",
      status: "SCHEDULED",
      completed_at: null,
      created_at: "2026-09-30T12:00:00Z",
    } as Installation;
    expect(
      sortInstallationHistory([completed, cancelled]).map(row => row.id)
    ).toEqual(["new", "old"]);
    expect(selectPrimaryInstallation([completed, revisit])?.id).toBe("active");
  });
  it("models scheduled, running, completed and cancelled order details", () => {
    const scheduled = {
      status: "SCHEDULED",
      team: { name: "Equipe 01" },
      responsible: { name: "Vitor Ramos" },
      vehicle_label: "Strada",
      address_snapshot: "Rua capturada, 10",
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      cancelled_reason: null,
    } as Installation;
    expect(getInstallationDetails(scheduled, "Rua antiga")).toMatchObject({
      status: "Agendada",
      team: "Equipe 01",
      responsible: "Vitor Ramos",
      vehicle: "Strada",
      address: "Rua capturada, 10",
    });
    expect(
      getInstallationDetails({
        ...scheduled,
        status: "IN_PROGRESS",
        started_at: "2026-09-29T12:00:00Z",
      }).startedAt
    ).toBeTruthy();
    expect(
      getInstallationDetails({
        ...scheduled,
        status: "COMPLETED",
        completed_at: "2026-09-29T13:00:00Z",
      }).completedAt
    ).toBeTruthy();
    expect(
      getInstallationDetails({
        ...scheduled,
        status: "CANCELLED",
        cancelled_at: "2026-09-29T13:00:00Z",
        cancelled_reason: "Reagendar",
      }).cancelledReason
    ).toBe("Reagendar");
  });
});
