import { describe, expect, it } from "vitest";
import { EMPTY_BOARD_FILTERS } from "@/shared/kanban/types";
import { clearArtworkFilters } from "./ArtworkFilters";

describe("ArtworkFilters", () => {
  it("limpa apenas o estado da experiência de Arte", () => {
    const result = clearArtworkFilters({ ...EMPTY_BOARD_FILTERS, search: "OS", mine: true, urgent: true, overdue: true, assigneeId: "1", artTag: "CRIACAO_ARTE", awaitingSupplies: true });
    expect(result).toMatchObject({ search: "", mine: false, urgent: false, overdue: false, assigneeId: "all", artTag: "all", awaitingSupplies: true });
  });
});
