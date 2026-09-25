import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./boardPagination";

describe("board repository pagination", () => {
  it("loads every active page, including records after 500", async () => {
    const rows = Array.from({ length: 620 }, (_, id) => id);
    const fetchPage = vi.fn(async (from: number, to: number) =>
      rows.slice(from, to + 1)
    );
    const result = await fetchAllPages(fetchPage);
    expect(result).toHaveLength(620);
    expect(result[500]).toBe(500);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("fails explicitly instead of silently truncating at the safety limit", async () => {
    await expect(
      fetchAllPages(
        async (from, to) =>
          Array.from({ length: to - from + 1 }, (_, index) => from + index),
        500,
        1_000
      )
    ).rejects.toThrow("limite técnico explícito");
  });
});
