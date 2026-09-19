import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  formatLocalDate,
  localDateRange,
  startOfLocalDay,
} from "./date";

describe("operational dates", () => {
  it("does not turn late Brazilian hours into the next UTC day", () => {
    expect(formatLocalDate(new Date("2026-09-19T01:30:00Z"))).toBe(
      "2026-09-18"
    );
  });

  it("crosses the operational midnight and calculates tomorrow", () => {
    const before = new Date("2026-09-19T02:59:59Z");
    const after = new Date("2026-09-19T03:00:00Z");
    expect(formatLocalDate(before)).toBe("2026-09-18");
    expect(formatLocalDate(after)).toBe("2026-09-19");
    expect(formatLocalDate(addLocalDays(before, 1))).toBe("2026-09-19");
  });

  it("builds inclusive local ranges", () => {
    expect(localDateRange(new Date("2026-12-30T15:00:00Z"), 2)).toEqual({
      start: "2026-12-30",
      end: "2027-01-01",
    });
    expect(
      startOfLocalDay(new Date("2026-09-18T15:00:00Z")).toISOString()
    ).toBe("2026-09-18T03:00:00.000Z");
  });
});
