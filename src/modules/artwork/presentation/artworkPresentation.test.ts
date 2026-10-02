import { describe, expect, it, vi } from "vitest";
import type { BoardCardModel, BoardFiltersState } from "@/shared/kanban/types";
import { EMPTY_BOARD_FILTERS } from "@/shared/kanban/types";
import { countArtworkAdvancedFilters, formatArtworkDeadline, getArtworkQueuePositions, sortArtworkCards } from "./artworkPresentation";

const card = (id: string, overrides: Record<string, unknown> = {}): BoardCardModel => ({
  order: { id, art_status: "Fila de Arte", created_at: `2026-01-0${id}T00:00:00Z`, delivery_date: null, client_name: id, sale_number: id, ...overrides },
  assignee: null, deadlines: [], itemsTotal: 0, itemsReady: 0, commentsTotal: 0, risk: "NORMAL",
} as BoardCardModel);

describe("artworkPresentation", () => {
  it("formata prazos no fuso de São Paulo", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(formatArtworkDeadline(null, now)).toBe("Sem prazo");
    expect(formatArtworkDeadline("2026-10-02", now)).toBe("Hoje");
    expect(formatArtworkDeadline("2026-10-03", now)).toBe("Amanhã");
    expect(formatArtworkDeadline("2026-10-01", now)).toBe("Atrasado há 1 dia");
    expect(formatArtworkDeadline("2026-10-10", now)).toBe("10/10/2026");
  });

  it("mantém posição real da fila antes dos filtros visuais", () => {
    const positions = getArtworkQueuePositions([card("1"), card("2"), card("3")]);
    expect(positions.get("3")).toBe(3);
  });

  it("ordena atrasada, urgente, futura e sem prazo", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T15:00:00Z"));
    const sorted = sortArtworkCards([
      card("4"), card("3", { delivery_date: "2026-10-10" }),
      card("2", { delivery_date: "2026-10-09", art_direction_tag: "URGENTE" }),
      card("1", { delivery_date: "2026-10-01" }),
    ]);
    expect(sorted.map(item => item.order.id)).toEqual(["1", "2", "3", "4"]);
    vi.useRealTimers();
  });

  it("conta somente filtros avançados", () => {
    const filters: BoardFiltersState = { ...EMPTY_BOARD_FILTERS, search: "x", mine: true, assigneeId: "u", artTag: "CRIACAO_ARTE", urgent: true };
    expect(countArtworkAdvancedFilters(filters)).toBe(3);
  });
});
