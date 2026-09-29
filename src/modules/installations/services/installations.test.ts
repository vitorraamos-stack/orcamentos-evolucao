import { describe, expect, it } from "vitest";
import {
  buildWazeUrl,
  buildMapsUrl,
  groupInstallationsByDay,
  isLegacyInstallation,
  isMyInstallation,
  isWaitingInstallation,
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
});
