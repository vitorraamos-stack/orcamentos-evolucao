import { describe, expect, it } from "vitest";
import { productEngineeringMutationSchema } from "./api";

const sourceVersionId = "10000000-0000-4000-8000-000000000001";

describe("CREATE_VERSION API contract", () => {
  it("accepts only the source identity and positive expected revision", () => {
    expect(
      productEngineeringMutationSchema.parse({
        action: "CREATE_VERSION",
        sourceVersionId,
        expectedRevision: 2,
      })
    ).toEqual({
      action: "CREATE_VERSION",
      sourceVersionId,
      expectedRevision: 2,
    });
  });

  it.each(["actorId", "productId", "versionNumber", "createdBy"])(
    "rejects browser-supplied %s",
    property => {
      expect(
        productEngineeringMutationSchema.safeParse({
          action: "CREATE_VERSION",
          sourceVersionId,
          expectedRevision: 1,
          [property]: property === "versionNumber" ? 2 : sourceVersionId,
        }).success
      ).toBe(false);
    }
  );
});
