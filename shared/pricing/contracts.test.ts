import { describe, expect, it } from "vitest";
import {
  PRICING_SCHEMA_VERSION,
  PRICING_POLICY_STATUSES,
  PRICING_POLICY_VERSION_STATUSES,
  PRICING_PERCENTAGE_BASES,
  PRICING_CHARGE_KINDS,
  PRICING_STRATEGY_TYPES,
  pricingPolicySchema,
  pricingPolicyVersionSchema,
  pricingRateSchema,
  pricingPercentageBaseSchema,
  pricingChargeKindSchema,
  pricingStrategyTypeSchema,
  validatePricingPolicy,
  validatePricingPolicyVersion,
  pricingRate,
  PricingDomainError,
  assertPricingPolicyVersionTransition,
  assertPricingPolicyVersionEditable,
  assertPricingPolicyVersionPublished,
} from "./index.js";

// TEST FIXTURES only: arbitrary identities and values, never business defaults.
const id = "123e4567-e89b-42d3-a456-426614174000";
const timestamp = "2026-01-02T03:04:05Z";
const policy = {
  id,
  code: "TEST_POLICY_1",
  name: "Test policy",
  status: "ACTIVE",
};
const version = {
  id,
  pricingPolicyId: id,
  versionNumber: 2,
  revision: 3,
  status: "DRAFT",
  createdAt: timestamp,
  createdBy: id,
  publishedAt: null,
  publishedBy: null,
};
function expectCode(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PricingDomainError);
    expect(error).toHaveProperty("code", code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("pricing policy contracts", () => {
  it("versions Pricing independently", () =>
    expect(PRICING_SCHEMA_VERSION).toBe("1.0"));
  it.each(PRICING_POLICY_STATUSES)("accepts %s", status => {
    expect(
      validatePricingPolicy({ ...policy, status, description: null }).status
    ).toBe(status);
  });
  it.each([
    { id: "invalid" },
    { status: "UNKNOWN" },
    { code: "" },
    { code: "lowercase" },
    { code: "HAS SPACE" },
    { code: "1CODE" },
    { code: " CODE " },
    { name: " " },
    { extra: true },
  ])("rejects invalid policy %j", patch => {
    expect(pricingPolicySchema.safeParse({ ...policy, ...patch }).success).toBe(
      false
    );
    expectCode(
      () => validatePricingPolicy({ ...policy, ...patch }),
      "INVALID_PRICING_POLICY"
    );
  });
});

describe("pricing policy versions", () => {
  it.each(PRICING_POLICY_VERSION_STATUSES)(
    "accepts %s with matching metadata",
    status => {
      const published = status === "PUBLISHED" || status === "RETIRED";
      const parsed = validatePricingPolicyVersion({
        ...version,
        status,
        publishedAt: published ? timestamp : null,
        publishedBy: published ? id : null,
      });
      expect(parsed.versionNumber).toBe(2);
      expect(parsed.revision).toBe(3);
    }
  );
  it.each(["versionNumber", "revision"])(
    "requires positive integer %s",
    field => {
      for (const value of [0, -1, 1.5])
        expect(
          pricingPolicyVersionSchema.safeParse({ ...version, [field]: value })
            .success
        ).toBe(false);
    }
  );
  it.each([
    { extra: true },
    { id: "bad" },
    { pricingPolicyId: "bad" },
    { createdBy: "bad" },
    { publishedBy: "bad" },
    { status: "UNKNOWN" },
    { createdAt: "2026-01-02" },
    { createdAt: "2026-02-30T03:04:05Z" },
    { createdAt: "2026-01-02T03:04:05" },
    { publishedAt: "not a timestamp" },
    { publishedAt: timestamp },
    { publishedBy: id },
    { publishedAt: timestamp, publishedBy: id },
    { status: "PUBLISHED" },
    { status: "RETIRED" },
  ])("rejects invalid version %j", patch => {
    expectCode(
      () => validatePricingPolicyVersion({ ...version, ...patch }),
      "INVALID_PRICING_POLICY_VERSION"
    );
  });
  it("accepts strict offset timestamps", () => {
    expect(
      pricingPolicyVersionSchema.safeParse({
        ...version,
        createdAt: "2026-01-02T03:04:05-03:00",
      }).success
    ).toBe(true);
  });
});

describe("lifecycle", () => {
  const allowed = new Set([
    "DRAFT:VALIDATING",
    "VALIDATING:DRAFT",
    "VALIDATING:PUBLISHED",
    "PUBLISHED:RETIRED",
  ]);
  for (const from of PRICING_POLICY_VERSION_STATUSES)
    for (const to of PRICING_POLICY_VERSION_STATUSES)
      it(`${from} → ${to}`, () => {
        const action = () => assertPricingPolicyVersionTransition(from, to);
        if (allowed.has(`${from}:${to}`)) expect(action).not.toThrow();
        else expectCode(action, "INVALID_PRICING_POLICY_TRANSITION");
      });
  it.each(PRICING_POLICY_VERSION_STATUSES)("editability of %s", status => {
    const action = () => assertPricingPolicyVersionEditable({ status });
    if (status === "DRAFT") expect(action).not.toThrow();
    else expectCode(action, "PRICING_POLICY_VERSION_NOT_EDITABLE");
  });
  it.each(PRICING_POLICY_VERSION_STATUSES)(
    "publication guard of %s",
    status => {
      const action = () => assertPricingPolicyVersionPublished({ status });
      if (status === "PUBLISHED") expect(action).not.toThrow();
      else expectCode(action, "PRICING_POLICY_VERSION_NOT_PUBLISHED");
    }
  );
});

describe("pricing rates and vocabulary", () => {
  it.each(["0", "0.03", "0.125", "0.999999", "0.10"])(
    "accepts decimal text %s unchanged",
    rate => {
      expect(pricingRate(rate)).toBe(rate);
    }
  );
  it.each([
    "-0.01",
    "1",
    "1.01",
    "1.5",
    "abc",
    "NaN",
    "Infinity",
    NaN,
    Infinity,
    0.1,
    "1e-1",
    "",
  ])("rejects %s", rate => {
    expect(pricingRateSchema.safeParse(rate).success).toBe(false);
    expectCode(() => pricingRate(rate), "INVALID_PRICING_RATE");
  });
  it("maps operational decimal limits to a domain error", () => {
    expectCode(
      () => pricingRate(`0.${"1".repeat(501)}`),
      "INVALID_PRICING_RATE"
    );
  });
  it("compares without rounding near the upper bound", () => {
    expect(pricingRate(`0.${"9".repeat(100)}`)).toBe(`0.${"9".repeat(100)}`);
    expect(pricingRateSchema.safeParse(`1.${"0".repeat(99)}1`).success).toBe(
      false
    );
  });
  it("accepts exactly the closed vocabulary", () => {
    expect(pricingPercentageBaseSchema.options).toEqual([
      "TOTAL_COST",
      "SELLING_PRICE",
    ]);
    expect(pricingChargeKindSchema.options).toEqual([
      "TAX",
      "COMMISSION",
      "FINANCIAL_FEE",
      "OTHER",
    ]);
    expect(pricingStrategyTypeSchema.options).toEqual([
      "GROSS_UP",
      "MARKUP_ON_COST",
    ]);
    for (const value of PRICING_PERCENTAGE_BASES)
      expect(pricingPercentageBaseSchema.parse(value)).toBe(value);
    for (const value of PRICING_CHARGE_KINDS)
      expect(pricingChargeKindSchema.parse(value)).toBe(value);
    for (const value of PRICING_STRATEGY_TYPES)
      expect(pricingStrategyTypeSchema.parse(value)).toBe(value);
    for (const schema of [
      pricingPercentageBaseSchema,
      pricingChargeKindSchema,
      pricingStrategyTypeSchema,
    ])
      for (const value of ["UNKNOWN", "", undefined, null])
        expect(schema.safeParse(value).success).toBe(false);
  });
});
