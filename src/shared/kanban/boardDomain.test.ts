import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import {
  applyArtworkPreset,
  applyProductionPreset,
  filterBoardCards,
  groupBoardCards,
  sortBoardCards,
} from "./boardDomain";
import { EMPTY_BOARD_FILTERS, type BoardCardModel } from "./types";

const order = (patch: Partial<OsOrder> = {}): OsOrder => ({
  id: crypto.randomUUID(),
  sale_number: "100",
  client_name: "Mercato",
  title: "Fachada",
  description: null,
  delivery_date: "2099-09-28",
  delivery_deadline_preset: null,
  delivery_deadline_started_at: null,
  logistic_type: "retirada",
  address: null,
  production_tag: null,
  insumos_details: null,
  insumos_return_notes: null,
  insumos_requested_at: null,
  insumos_resolved_at: null,
  insumos_resolved_by: null,
  art_direction_tag: null,
  art_status: "Caixa de Entrada",
  prod_status: null,
  reproducao: false,
  letra_caixa: false,
  archived: false,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...patch,
});
const card = (
  patch: Partial<OsOrder> = {},
  userId = "user-1"
): BoardCardModel => ({
  order: order(patch),
  assignee: { userId, name: "Ana", email: null },
  deadlines: [],
  itemsTotal: 3,
  itemsReady: 2,
  commentsTotal: 1,
  risk: "NORMAL",
});

describe("board domain", () => {
  it("groups by the persisted column and keeps Ajustes separate", () => {
    const grouped = groupBoardCards([card({ art_status: "Ajustes" })], "art", [
      "Caixa de Entrada",
      "Ajustes",
    ]);
    expect(grouped.get("Ajustes")).toHaveLength(1);
    expect(grouped.get("Caixa de Entrada")).toHaveLength(0);
  });
  it("sorts critical, urgent, nearest deadline and oldest", () => {
    const critical = { ...card(), risk: "CRITICO" as const };
    const urgent = card({ art_direction_tag: "URGENTE" });
    const normal = card({ delivery_date: "2099-01-01" });
    expect(sortBoardCards([normal, urgent, critical])).toEqual([
      critical,
      urgent,
      normal,
    ]);
  });
  it("filters search, mine, urgent, overdue and operational flags", () => {
    const own = card({
      client_name: "Mercato",
      art_direction_tag: "URGENTE",
      production_tag: "AGUARDANDO_INSUMOS",
      reproducao: true,
    });
    const other = card({ client_name: "Outra" }, "user-2");
    const filters = {
      ...EMPTY_BOARD_FILTERS,
      search: "merc",
      mine: true,
      urgent: true,
      awaitingSupplies: true,
      reproducao: true,
    };
    expect(filterBoardCards([own, other], filters, "user-1")).toEqual([own]);
  });
  it("applies artwork and production route presets", () => {
    const approval = card({ art_status: "Para Aprovação" });
    const finishing = card({ prod_status: "Em Acabamento" });
    expect(applyArtworkPreset([approval, finishing], "approvals")).toEqual([
      approval,
    ]);
    expect(applyProductionPreset([approval, finishing], "finishing")).toEqual([
      finishing,
    ]);
  });
});
