import { describe, expect, it } from "vitest";
import {
  PricingPersistenceCompatibilityError,
} from "./mappers";
import { mapOfficialPricingContext } from "./calculationContext";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";

const payload = (installments = 6) => ({
  schema_version: "1.0",
  engine_version: "1.0",
  policy: {
    id: id(1),
    code: "STANDARD",
    name: "Standard",
    description: null,
    status: "ACTIVE",
  },
  version: {
    id: id(2),
    pricing_policy_id: id(1),
    version_number: 3,
    revision: 5,
    status: "PUBLISHED",
    notes: null,
    created_at: now,
    created_by: id(9),
    published_at: now,
    published_by: id(9),
  },
  strategy_type: "MARKUP_ON_COST",
  markup: "1",
  markup_base: "TOTAL_COST",
  charges: [],
  product_settings: {
    product_id: id(4),
    pricing_policy_id: id(1),
    minimum_selling_price: "120",
    revision: 2,
    updated_at: now,
    updated_by: id(9),
  },
  payment_term:
    installments <= 3
      ? {
          source: "SYSTEM_ZERO",
          installments,
          rate: "0",
          revision: null,
        }
      : {
          source: "CONFIGURED",
          installments,
          rate: "0.05",
          revision: 4,
        },
});

describe("Official Pricing context mapper", () => {
  it("maps configured payment context without numeric coercion", () => {
    const context = mapOfficialPricingContext(payload());
    expect(context.productSettings.minimumSellingPrice).toBe("120");
    expect(context.definition.strategy).toMatchObject({ markup: "1" });
    expect(context.payment).toEqual({
      source: "CONFIGURED",
      installments: 6,
      rate: "0.05",
      revision: 4,
    });
  });

  it.each([1, 2, 3])("maps %sx as deterministic SYSTEM_ZERO", installments => {
    expect(mapOfficialPricingContext(payload(installments)).payment).toEqual({
      source: "SYSTEM_ZERO",
      installments,
      rate: "0",
      revision: null,
    });
  });

  it("fails closed when policy assignment and aggregate disagree", () => {
    const dto = payload();
    dto.product_settings.pricing_policy_id = id(7);
    expect(() => mapOfficialPricingContext(dto)).toThrow(
      PricingPersistenceCompatibilityError
    );
  });

  it.each([
    { source: "SYSTEM_ZERO", installments: 4, rate: "0", revision: null },
    { source: "SYSTEM_ZERO", installments: 2, rate: "0.01", revision: null },
    { source: "CONFIGURED", installments: 3, rate: "0", revision: 1 },
    { source: "CONFIGURED", installments: 6, rate: "0.05", revision: null },
    { source: "CONFIGURED", installments: 6, rate: 0.05, revision: 1 },
  ])("fails closed for invalid payment context %#", payment_term => {
    expect(() =>
      mapOfficialPricingContext({ ...payload(), payment_term })
    ).toThrow(PricingPersistenceCompatibilityError);
  });
});
