import { describe, expect, it } from "vitest";
import {
  PricingPersistenceCompatibilityError,
  mapPricingAggregate,
  mapPricingPaymentTerm,
  mapProductPricingSettings,
} from "./mappers";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";
const aggregate = () => ({
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
    version_number: 1,
    revision: 3,
    status: "DRAFT",
    notes: null,
    created_at: now,
    created_by: id(3),
    published_at: null,
    published_by: null,
  },
  strategy_type: "MARKUP_ON_COST",
  markup: "1.2500000000000000001",
  markup_base: "TOTAL_COST",
  charges: [],
});

describe("Pricing persistence mappers", () => {
  it("maps the persisted v1 aggregate without converting financial decimals", () => {
    const mapped = mapPricingAggregate(aggregate());
    expect(mapped.definition.strategy).toEqual({
      type: "MARKUP_ON_COST",
      markup: "1.2500000000000000001",
      markupBase: "TOTAL_COST",
    });
    expect(mapped.definition.charges).toEqual([]);
  });

  it.each([
    ["schema_version", "2.0", "UNSUPPORTED_PRICING_SCHEMA_VERSION"],
    ["engine_version", "2.0", "UNSUPPORTED_PRICING_ENGINE_VERSION"],
  ] as const)("fails closed for incompatible %s", (field, value, code) => {
    expect(() => mapPricingAggregate({ ...aggregate(), [field]: value })).toThrowError(
      expect.objectContaining({ code })
    );
  });

  it("fails closed when the persisted charges field is missing", () => {
    const { charges: _charges, ...withoutCharges } = aggregate();
    expect(() => mapPricingAggregate(withoutCharges)).toThrow(
      PricingPersistenceCompatibilityError
    );
  });

  it("rejects non-v1 strategies and persisted charges", () => {
    expect(() =>
      mapPricingAggregate({ ...aggregate(), strategy_type: "GROSS_UP" })
    ).toThrow(PricingPersistenceCompatibilityError);
    expect(() =>
      mapPricingAggregate({ ...aggregate(), charges: [{ id: id(9) }] })
    ).toThrow(PricingPersistenceCompatibilityError);
  });

  it.each([1.2, null, undefined])("rejects numeric/non-text markup %s", markup => {
    expect(() => mapPricingAggregate({ ...aggregate(), markup })).toThrow(
      PricingPersistenceCompatibilityError
    );
  });

  it("maps product minimum and payment rate as text only", () => {
    expect(
      mapProductPricingSettings({
        product_id: id(4),
        pricing_policy_id: id(1),
        minimum_selling_price: "99.90",
        revision: 2,
        updated_at: now,
        updated_by: id(3),
      }).minimumSellingPrice
    ).toBe("99.90");
    expect(
      mapPricingPaymentTerm({
        installments: 6,
        rate: "0.0525",
        revision: 4,
        updated_at: now,
        updated_by: id(3),
      }).rate
    ).toBe("0.0525");
    expect(() =>
      mapProductPricingSettings({
        product_id: id(4),
        pricing_policy_id: id(1),
        minimum_selling_price: 99.9,
        revision: 2,
        updated_at: now,
        updated_by: id(3),
      })
    ).toThrow(PricingPersistenceCompatibilityError);
    expect(() =>
      mapPricingPaymentTerm({
        installments: 6,
        rate: 0.0525,
        revision: 4,
        updated_at: now,
        updated_by: id(3),
      })
    ).toThrow(PricingPersistenceCompatibilityError);
  });
});
