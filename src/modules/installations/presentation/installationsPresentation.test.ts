import { describe, expect, it } from "vitest";
import type { Installation } from "../types";
import {
  filterAgendaInstallations,
  formatRouteDistance,
  formatRouteDuration,
  getSaoPauloWeekDays,
  getSaoPauloWeekRange,
  isInstallationCompletedThisWeek,
  isInstallationToday,
  isScheduledInstallationOverdue,
  sortWaitingOrders,
  summarizeInstallations,
} from "./installationsPresentation";

const row = (overrides: Partial<Installation> = {}): Installation => ({
  id: "i",
  os_id: "o",
  team_id: null,
  responsible_id: null,
  status: "SCHEDULED",
  scheduled_start: "2026-10-02T15:00:00.000Z",
  scheduled_end: null,
  estimated_duration_minutes: null,
  vehicle_label: null,
  address_snapshot: "",
  address_lat: null,
  address_lng: null,
  notes: null,
  completion_notes: null,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  cancelled_reason: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...overrides,
});
const now = new Date("2026-10-02T16:00:00.000Z");
describe("installations presentation", () => {
  it("uses Sao Paulo today and only active statuses", () => {
    expect(isInstallationToday(row(), now)).toBe(true);
    expect(isInstallationToday(row({ status: "COMPLETED" }), now)).toBe(false);
    expect(
      isInstallationToday(row({ scheduled_start: "2026-10-03T02:30:00Z" }), now)
    ).toBe(true);
  });
  it("derives overdue only for scheduled past items", () => {
    expect(isScheduledInstallationOverdue(row(), now)).toBe(true);
    expect(
      isScheduledInstallationOverdue(
        row({ scheduled_start: "2026-10-02T18:00:00Z" }),
        now
      )
    ).toBe(false);
    expect(
      isScheduledInstallationOverdue(row({ status: "IN_PROGRESS" }), now)
    ).toBe(false);
    expect(
      isScheduledInstallationOverdue(row({ status: "COMPLETED" }), now)
    ).toBe(false);
  });
  it("builds Monday-through-Sunday weeks across month and year", () => {
    expect(getSaoPauloWeekRange(new Date("2026-10-01T15:00:00Z"))).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
    expect(getSaoPauloWeekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
  it("counts completed events in the current Sao Paulo week", () => {
    expect(
      isInstallationCompletedThisWeek(
        row({ status: "COMPLETED", completed_at: "2026-10-02T20:00:00Z" }),
        now
      )
    ).toBe(true);
    expect(
      isInstallationCompletedThisWeek(
        row({ status: "COMPLETED", completed_at: "2026-09-27T20:00:00Z" }),
        now
      )
    ).toBe(false);
  });
  it("summarizes only the already-visible sets", () => {
    const agenda = [
      row({ id: "a" }),
      row({ id: "b", status: "IN_PROGRESS" }),
      row({ id: "c", scheduled_start: "2026-10-03T18:00:00Z" }),
    ];
    const history = Array.from({ length: 4 }, (_, i) =>
      row({
        id: `h${i}`,
        status: "COMPLETED",
        completed_at: "2026-10-02T20:00:00Z",
      })
    );
    expect(summarizeInstallations(agenda, history, 3, now)).toEqual({
      today: 2,
      waiting: 3,
      inProgress: 1,
      overdue: 1,
      completedWeek: 4,
    });
    expect(filterAgendaInstallations(agenda, "overdue", now)).toHaveLength(1);
  });
  it("sorts deadlines ascending and leaves missing deadlines last", () => {
    const base = {
      id: "",
      sale_number: null,
      client_name: "",
      delivery_date: null,
      address: null,
      address_lat: null,
      address_lng: null,
      logistic_type: null,
      prod_status: null,
      archived: false,
      updated_at: "",
    };
    expect(
      sortWaitingOrders(
        [
          { ...base, id: "none" },
          { ...base, id: "later", delivery_date: "2026-10-10" },
          { ...base, id: "first", delivery_date: "2026-10-03" },
        ],
        "deadline"
      ).map(i => i.id)
    ).toEqual(["first", "later", "none"]);
  });
  it("formats route measurements", () => {
    expect(formatRouteDistance(850)).toBe("850 m");
    expect(formatRouteDistance(12400)).toBe("12,4 km");
    expect(formatRouteDuration(5100)).toBe("1h 25min");
  });
});
