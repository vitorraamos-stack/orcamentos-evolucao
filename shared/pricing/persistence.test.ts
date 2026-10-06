import { describe, expect, it } from "vitest";
import {
  pricingPaymentTermSchema,
  pricingPersistenceMutationSchema,
  productPricingSettingsSchema,
} from "./persistence";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";

describe("Pricing persistence contracts", () => {
  it("accepts product settings with decimal text", () => {
    expect(
      productPricingSettingsSchema.parse({
        productId: id(1),
        pricingPolicyId: id(2),
        minimumSellingPrice: "150.50",
        revision: 1,
        updatedAt: now,
        updatedBy: id(3),
      }).minimumSellingPrice
    ).toBe("150.50");
  });

  it.each([150.5, -1, "1e2", "1,50"])(
    "rejects invalid minimum price %s",
    value => {
      expect(
        productPricingSettingsSchema.safeParse({
          productId: id(1),
          pricingPolicyId: id(2),
          minimumSellingPrice: value,
          revision: 1,
          updatedAt: now,
          updatedBy: id(3),
        }).success
      ).toBe(false);
    }
  );

  it.each([1, 2, 3])("requires zero rate for %sx", installments => {
    expect(
      pricingPaymentTermSchema.safeParse({
        installments,
        rate: "0.01",
        revision: 1,
        updatedAt: now,
        updatedBy: id(3),
      }).success
    ).toBe(false);
    expect(
      pricingPaymentTermSchema.safeParse({
        installments,
        rate: "0.000",
        revision: 1,
        updatedAt: now,
        updatedBy: id(3),
      }).success
    ).toBe(true);
  });

  it("allows configured financial rates from 4x to 12x", () => {
    for (let installments = 4; installments <= 12; installments += 1)
      expect(
        pricingPaymentTermSchema.safeParse({
          installments,
          rate: "0.123456789",
          revision: 1,
          updatedAt: now,
          updatedBy: id(3),
        }).success
      ).toBe(true);
  });

  it("rejects JS numbers for financial values", () => {
    expect(
      pricingPersistenceMutationSchema.safeParse({
        action: "CREATE_POLICY",
        policy: {
          code: "STANDARD",
          name: "Standard",
          status: "ACTIVE",
        },
        markup: 1,
      }).success
    ).toBe(false);
    expect(
      pricingPersistenceMutationSchema.safeParse({
        action: "SET_PAYMENT_TERM",
        installments: 6,
        rate: 0.05,
        expectedRevision: null,
      }).success
    ).toBe(false);
  });


  it("requires the caller-observed published version for publication CAS", () => {
    const base = {
      action: "PUBLISH_VERSION",
      versionId: id(2),
      expectedRevision: 1,
    } as const;

    expect(
      pricingPersistenceMutationSchema.safeParse(base).success
    ).toBe(false);

    expect(
      pricingPersistenceMutationSchema.safeParse({
        ...base,
        expectedCurrentPublishedVersionId: null,
      }).success
    ).toBe(true);

    expect(
      pricingPersistenceMutationSchema.safeParse({
        ...base,
        expectedCurrentPublishedVersionId: id(8),
      }).success
    ).toBe(true);
  });

  it("keeps commands strict and requires explicit optimistic-lock intent", () => {
    expect(
      pricingPersistenceMutationSchema.safeParse({
        action: "SET_PRODUCT_PRICING",
        productId: id(1),
        pricingPolicyId: id(2),
        minimumSellingPrice: "100",
        expectedRevision: null,
        extra: true,
      }).success
    ).toBe(false);
    expect(
      pricingPersistenceMutationSchema.safeParse({
        action: "SET_PRODUCT_PRICING",
        productId: id(1),
        pricingPolicyId: id(2),
        minimumSellingPrice: "100",
      }).success
    ).toBe(false);
  });
});
