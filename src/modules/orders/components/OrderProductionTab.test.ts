import { describe, expect, it } from "vitest";
import { operationEditDraft, operationEditInput } from "./OrderProductionTab";
import type { ItemOperation } from "@/modules/production/operations";

const operation: ItemOperation = { id: "op", item_id: "item", work_center: "METALWORK", status: "COMPLETED", assigned_to: "user-1", is_required: true, notes: "Conferir medidas", blocked_reason: null, sort_order: 3, started_at: "2026-09-28T10:00:00Z", completed_at: "2026-09-28T11:00:00Z", created_at: "2026-09-28T09:00:00Z", updated_at: "2026-09-28T11:00:00Z" };

describe("operation editing", () => {
  it("prefills only editable values from an existing operation", () => {
    expect(operationEditDraft(operation)).toEqual({ workCenter: "METALWORK", assigned: "user-1", isRequired: true, notes: "Conferir medidas", sortOrder: 3 });
    expect(operationEditDraft(operation)).not.toHaveProperty("status");
    expect(operationEditDraft(operation)).not.toHaveProperty("started_at");
  });

  it("changes center, assignee, requirement and notes", () => {
    expect(operationEditInput({ workCenter: "ASSEMBLY", assigned: "user-2", isRequired: false, notes: "Nova nota", sortOrder: 3 })).toEqual({ workCenter: "ASSEMBLY", assignedTo: "user-2", isRequired: false, notes: "Nova nota", sortOrder: 3 });
  });

  it("removes the assignee explicitly", () => {
    expect(operationEditInput({ ...operationEditDraft(operation), assigned: "none" }).assignedTo).toBeNull();
  });
});
