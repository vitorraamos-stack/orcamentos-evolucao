import { describe, expect, it } from "vitest";
import { filterHistory, groupHistoryByDate, dayKey } from "./historyView";
const activities = [
 { id: "a", created_at: "2026-10-30T13:00:00Z", type: "status_change", payload: {} },
 { id: "b", created_at: "2026-10-29T20:00:00Z", type: "details_updated", payload: {} },
 { id: "c", created_at: "2026-10-29T12:00:00Z", type: "comment_created", payload: {} },
];
describe("history selectors", () => {
  it("groups by Sao Paulo local day without sorting or mutating source", () => {
    expect(dayKey("2026-10-30T01:00:00Z")).toBe("2026-10-29");
    expect(groupHistoryByDate(activities).map(g => g.entries.map(e => e.id))).toEqual([["a"],["b","c"]]);
    expect(activities[0].id).toBe("a");
  });
  it("filters categories and descriptions without changing stored events", () => {
    expect(filterHistory(activities, "", "stages", e => e.type).map(e => e.id)).toEqual(["a"]);
    expect(filterHistory(activities, "details", "all", e => e.type).map(e => e.id)).toEqual(["b"]);
  });
});
