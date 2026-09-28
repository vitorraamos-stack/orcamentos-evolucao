import { describe, expect, it } from "vitest";
import { fromSaoPauloDateTimeLocal, saoPauloDateKey, toSaoPauloDateTimeLocal } from "./saoPauloTime";

describe("Sao Paulo business timezone", () => {
  it("converts UTC timestamps to datetime-local", () => {
    expect(toSaoPauloDateTimeLocal("2026-10-01T12:00:00.000Z")).toBe("2026-10-01T09:00");
  });
  it("converts datetime-local to UTC independently of the host timezone", () => {
    expect(fromSaoPauloDateTimeLocal("2026-10-01T09:00")).toBe("2026-10-01T12:00:00.000Z");
  });
  it("groups an instant by its Sao Paulo calendar date", () => {
    expect(saoPauloDateKey("2026-10-02T01:00:00.000Z")).toBe("2026-10-01");
  });
});
