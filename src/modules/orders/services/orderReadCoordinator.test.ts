import { describe, expect, it } from "vitest";
import { createOrderReadCoordinator } from "./orderReadCoordinator";

describe("EvoluSystem OS reads — request isolation", () => {
  it("prevents duplicate in-flight reads for one tab without blocking other tabs", () => {
    const reads = createOrderReadCoordinator();
    reads.activate("os-a");
    const items = reads.begin("os-a", "tab:items");
    expect(items).not.toBeNull();
    expect(reads.begin("os-a", "tab:items")).toBeNull();
    const comments = reads.begin("os-a", "tab:comments");
    expect(comments).not.toBeNull();
    expect(reads.isCurrent(items!)).toBe(true);
    reads.finish(items!);
    expect(reads.begin("os-a", "tab:items")).not.toBeNull();
  });

  it("rejects responses from a previous OS, even for the same tab name", () => {
    const reads = createOrderReadCoordinator();
    reads.activate("os-a");
    const before = reads.begin("os-a", "tab:history")!;
    reads.activate("os-b");
    const after = reads.begin("os-b", "tab:history")!;
    expect(reads.isCurrent(before)).toBe(false);
    expect(reads.isCurrent(after)).toBe(true);
    reads.finish(before);
    expect(reads.begin("os-b", "tab:history")).toBeNull();
    reads.finish(after);
    expect(reads.begin("os-b", "tab:history")).not.toBeNull();
  });

  it("keeps only the latest refresh when earlier server responses arrive late", () => {
    const reads = createOrderReadCoordinator();
    reads.activate("os-a");
    const older = reads.begin("os-a", "detail", true)!;
    const newer = reads.begin("os-a", "detail", true)!;
    expect(older.sequence).toBeLessThan(newer.sequence);
    expect(reads.isCurrent(older)).toBe(false);
    reads.finish(older);
    expect(reads.isCurrent(newer)).toBe(true);
    reads.finish(newer);
    expect(reads.isCurrent(newer)).toBe(false);
  });

  it("allows read-after-write refreshes to supersede stale production requests", () => {
    const reads = createOrderReadCoordinator();
    reads.activate("os-a");
    const before = reads.begin("os-a", "production-data", true)!;
    const after = reads.begin("os-a", "production-data", true)!;
    expect(reads.isCurrent(before)).toBe(false);
    expect(reads.isCurrent(after)).toBe(true);
  });

  it("invalidates outstanding requests after cleanup and rejects other order identifiers", () => {
    const reads = createOrderReadCoordinator();
    reads.activate("os-a");
    expect(reads.isActive("os-a")).toBe(true);
    expect(reads.isActive("os-b")).toBe(false);
    expect(reads.begin("os-b", "detail")).toBeNull();
    const ticket = reads.begin("os-a", "detail")!;
    reads.invalidate();
    expect(reads.isActive("os-a")).toBe(false);
    expect(reads.isCurrent(ticket)).toBe(false);
    expect(reads.begin("os-a", "detail")).toBeNull();
    reads.activate("os-a");
    expect(reads.isCurrent(ticket)).toBe(false);
    expect(reads.begin("os-a", "detail")).not.toBeNull();
  });
});
