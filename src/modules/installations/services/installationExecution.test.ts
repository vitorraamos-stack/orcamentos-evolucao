import { describe, expect, it } from "vitest";
import {
  getInstallationCompletionReadiness,
  isChecklistReady,
} from "./installationExecution";
import type { InstallationChecklistItem, InstallationEvidence } from "../types";
const item = (
  phase: "PRE_START" | "COMPLETION",
  status: "PENDING" | "DONE" | "NOT_APPLICABLE",
  allow = false
): InstallationChecklistItem => ({
  id: crypto.randomUUID(),
  installation_id: "i",
  phase,
  code: "X",
  label: "Item",
  status,
  is_required: true,
  allow_not_applicable: allow,
  note: null,
  completed_by: null,
  completed_at: null,
  sort_order: 0,
});
describe("installation execution readiness", () => {
  it("blocks empty and incomplete pre-start checklists", () => {
    expect(isChecklistReady([], "PRE_START")).toBe(false);
    expect(isChecklistReady([item("PRE_START", "PENDING")], "PRE_START")).toBe(
      false
    );
  });
  it("accepts completed pre-start checklist", () =>
    expect(
      isChecklistReady(
        Array.from({ length: 4 }, () => item("PRE_START", "DONE")),
        "PRE_START"
      )
    ).toBe(true));
  it("accepts N/A only when allowed", () => {
    expect(
      isChecklistReady(
        [item("COMPLETION", "NOT_APPLICABLE", true)],
        "COMPLETION"
      )
    ).toBe(true);
    expect(
      isChecklistReady(
        [item("COMPLETION", "NOT_APPLICABLE", false)],
        "COMPLETION"
      )
    ).toBe(false);
  });
  it("requires final checklist and AFTER evidence", () => {
    const ready = [item("COMPLETION", "DONE")];
    expect(
      getInstallationCompletionReadiness("IN_PROGRESS", ready, []).ready
    ).toBe(false);
    const photo = [{ phase: "AFTER" } as InstallationEvidence];
    expect(
      getInstallationCompletionReadiness("IN_PROGRESS", ready, photo).ready
    ).toBe(true);
    expect(
      getInstallationCompletionReadiness(
        "IN_PROGRESS",
        [item("COMPLETION", "PENDING")],
        Array(5).fill(photo[0])
      ).ready
    ).toBe(false);
  });
});
