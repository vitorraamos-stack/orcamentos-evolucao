import { describe, expect, it } from "vitest";
import { costingMutationSchema, costingQuerySchema } from "./api.js";

const resource = {
  type: "MATERIAL",
  code: "VINYL",
  name: "Vinyl",
  description: "",
  costUnit: "m2",
};
const id = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-05-01T00:00:00.000Z";

describe("Costing API contracts", () => {
  it("accepts a strict create without browser-controlled identity or status", () => {
    expect(
      costingMutationSchema.parse({ action: "CREATE_RESOURCE", resource })
    ).toEqual({ action: "CREATE_RESOURCE", resource });
    expect(
      costingMutationSchema.safeParse({
        action: "CREATE_RESOURCE",
        resource: { ...resource, id },
      }).success
    ).toBe(false);
    expect(
      costingMutationSchema.safeParse({
        action: "CREATE_RESOURCE",
        resource: { ...resource, status: "ACTIVE" },
      }).success
    ).toBe(false);
  });

  it("requires optimistic concurrency for updates", () => {
    const update = {
      action: "UPDATE_RESOURCE",
      resource: { ...resource, id, status: "ACTIVE" },
    };
    expect(costingMutationSchema.safeParse(update).success).toBe(false);
    expect(
      costingMutationSchema.safeParse({
        ...update,
        expectedUpdatedAt: timestamp,
      }).success
    ).toBe(true);
  });

  it("accepts only a string amount and server-controlled rate dimensions", () => {
    const rate = {
      action: "SET_CURRENT_RATE",
      type: "MATERIAL",
      resourceId: id,
      amount: "12345678901234567890.12345678901234567890",
      effectiveFrom: timestamp,
    };
    expect(costingMutationSchema.parse(rate).amount).toBe(rate.amount);
    expect(
      costingMutationSchema.safeParse({ ...rate, amount: 12.34 }).success
    ).toBe(false);
    for (const extra of [
      "unit",
      "currency",
      "effectiveTo",
      "effectiveCostAt",
      "unknown",
    ])
      expect(
        costingMutationSchema.safeParse({ ...rate, [extra]: "x" }).success
      ).toBe(false);
  });

  it("rejects unknown GET simulation parameters", () => {
    expect(
      costingQuerySchema.safeParse({
        type: "MATERIAL",
        effectiveCostAt: timestamp,
      }).success
    ).toBe(false);
  });
});
