import { describe, expect, it } from "vitest";
import { getDeadlineState } from "./orderDeadlines";

describe("getDeadlineState", () => {
  const now = new Date("2026-09-25T02:30:00Z"); // 24/09 in São Paulo
  it("uses the São Paulo operational day", () => expect(getDeadlineState({ due_date: "2026-09-24" }, now)).toBe("TODAY"));
  it("classifies future dates", () => expect(getDeadlineState({ due_date: "2026-09-25" }, now)).toBe("NORMAL"));
  it("classifies overdue dates", () => expect(getDeadlineState({ due_date: "2026-09-23" }, now)).toBe("OVERDUE"));
  it("prioritizes completion", () => expect(getDeadlineState({ due_date: "2026-09-23", completed_at: "2026-09-22T10:00:00Z" }, now)).toBe("COMPLETED"));
});
