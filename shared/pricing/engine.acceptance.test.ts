import { describe, expect, it } from "vitest";
import {
  MAX_PRICING_CHARGES,
  PRICING_CHARGE_KINDS,
  PRICING_ENGINE_VERSION,
  PRICING_PERCENTAGE_BASES,
  PRICING_TECHNICAL_PRECISION,
  calculatePricing,
  pricingEngineInputSchema,
  pricingEngineResultSchema,
  pricingMarkup,
  PricingDomainError,
} from "./index.js";

const ids = {
  policy: "50000000-0000-4000-8000-000000000001",
  version: "50000000-0000-4000-8000-000000000002",
  user: "50000000-0000-4000-8000-000000000003",
  chargeA: "50000000-0000-4000-8000-000000000004",
  chargeB: "50000000-0000-4000-8000-000000000005",
  product: "50000000-0000-4000-8000-000000000010",
  productVersion: "50000000-0000-4000-8000-000000000011",
};
const timestamp = "2026-01-02T03:04:05Z";

const charge = (
  id: string,
  rate: unknown,
  percentageBase: unknown = "TOTAL_COST",
  kind: unknown = "OTHER"
) => ({ id, kind, rate, percentageBase });

function definition(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0",
    version: {
      id: ids.version,
      pricingPolicyId: ids.policy,
      versionNumber: 1,
      revision: 1,
      status: "PUBLISHED",
      createdAt: timestamp,
      createdBy: ids.user,
      publishedAt: timestamp,
      publishedBy: ids.user,
    },
    strategy: {
      type: "GROSS_UP",
      targetMargin: "0.2",
      marginBase: "SELLING_PRICE",
    },
    charges: [],
    ...overrides,
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    policy: {
      id: ids.policy,
      code: "TEST_ACCEPTANCE",
      name: "Test acceptance",
      status: "ACTIVE",
    },
    definition: definition(),
    costBasis: {
      totalCost: { currency: "BRL", amount: "80" },
      productId: ids.product,
      productVersionId: ids.productVersion,
      productVersionNumber: 1,
      productVersionRevision: 1,
      costingAggregationVersion: "1.0",
      effectiveCostAt: timestamp,
      commercialQuantity: "1",
    },
    ...overrides,
  };
}

function expectCode(action: () => unknown, code: string): PricingDomainError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PricingDomainError);
    expect(error).toHaveProperty("code", code);
    return error as PricingDomainError;
  }
  throw new Error(`Expected ${code}`);
}

function grossUp(
  margin: string,
  charges: readonly Record<string, unknown>[] = []
) {
  return definition({
    strategy: {
      type: "GROSS_UP",
      targetMargin: margin,
      marginBase: "SELLING_PRICE",
    },
    charges,
  });
}

function markup(value: string, charges: readonly Record<string, unknown>[] = []) {
  return definition({
    strategy: {
      type: "MARKUP_ON_COST",
      markup: value,
      markupBase: "TOTAL_COST",
    },
    charges,
  });
}

describe("Pricing 16B acceptance — strict boundaries", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["primitive", "invalid"],
    ["array", []],
  ])("rejects an invalid root envelope: %s", (_name, input) => {
    expectCode(() => calculatePricing(input), "INVALID_PRICING_DEFINITION");
  });

  it("rejects missing or extra root fields", () => {
    const valid = fixture();
    const { policy: _policy, ...missing } = valid;
    expectCode(
      () => calculatePricing(missing),
      "INVALID_PRICING_DEFINITION"
    );
    expectCode(
      () => calculatePricing({ ...valid, extra: true }),
      "INVALID_PRICING_DEFINITION"
    );
    expect(pricingEngineInputSchema.safeParse({ ...valid, extra: true }).success).toBe(
      false
    );
  });

  it.each([
    [
      "policy",
      () => {
        const valid = fixture();
        return { ...valid, policy: { ...valid.policy, extra: true } };
      },
      "INVALID_PRICING_POLICY",
    ],
    [
      "definition",
      () => {
        const valid = fixture();
        return { ...valid, definition: { ...valid.definition, extra: true } };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "version",
      () => {
        const valid = fixture();
        return {
          ...valid,
          definition: {
            ...valid.definition,
            version: { ...valid.definition.version, extra: true },
          },
        };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "strategy",
      () => {
        const valid = fixture();
        return {
          ...valid,
          definition: {
            ...valid.definition,
            strategy: { ...valid.definition.strategy, extra: true },
          },
        };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "charge",
      () => {
        const valid = fixture();
        return {
          ...valid,
          definition: {
            ...valid.definition,
            charges: [
              {
                ...charge(ids.chargeA, "0.1"),
                extra: true,
              },
            ],
          },
        };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "costBasis",
      () => {
        const valid = fixture();
        return { ...valid, costBasis: { ...valid.costBasis, extra: true } };
      },
      "INVALID_PRICING_COST_BASIS",
    ],
    [
      "money",
      () => {
        const valid = fixture();
        return {
          ...valid,
          costBasis: {
            ...valid.costBasis,
            totalCost: { ...valid.costBasis.totalCost, extra: true },
          },
        };
      },
      "INVALID_PRICING_COST_BASIS",
    ],
  ] as const)("rejects extra nested property in %s", (_name, make, code) => {
    expectCode(() => calculatePricing(make()), code);
  });

  it.each([
    [
      "policy id",
      () => {
        const valid = fixture();
        return { ...valid, policy: { ...valid.policy, id: "bad" } };
      },
      "INVALID_PRICING_POLICY",
    ],
    [
      "policy version id",
      () => {
        const valid = fixture();
        return {
          ...valid,
          definition: {
            ...valid.definition,
            version: { ...valid.definition.version, id: "bad" },
          },
        };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "charge id",
      () => {
        const valid = fixture();
        return {
          ...valid,
          definition: {
            ...valid.definition,
            charges: [charge("bad", "0.1")],
          },
        };
      },
      "INVALID_PRICING_DEFINITION",
    ],
    [
      "product id",
      () => {
        const valid = fixture();
        return {
          ...valid,
          costBasis: { ...valid.costBasis, productId: "bad" },
        };
      },
      "INVALID_PRICING_COST_BASIS",
    ],
    [
      "product version id",
      () => {
        const valid = fixture();
        return {
          ...valid,
          costBasis: { ...valid.costBasis, productVersionId: "bad" },
        };
      },
      "INVALID_PRICING_COST_BASIS",
    ],
  ] as const)("rejects invalid %s", (_name, make, code) => {
    expectCode(() => calculatePricing(make()), code);
  });

  it.each(["schemaVersion", "version", "strategy", "charges"])(
    "does not default a missing definition field: %s",
    field => {
      const valid = fixture();
      const record = { ...valid.definition } as Record<string, unknown>;
      delete record[field];
      expectCode(
        () => calculatePricing({ ...valid, definition: record }),
        "INVALID_PRICING_DEFINITION"
      );
    }
  );

  it.each([
    [
      "charge kind",
      () =>
        grossUp("0.2", [
          charge(ids.chargeA, "0.1", "TOTAL_COST", "UNKNOWN"),
        ]),
    ],
    [
      "percentage base",
      () =>
        grossUp("0.2", [
          charge(ids.chargeA, "0.1", "UNKNOWN", "TAX"),
        ]),
    ],
    [
      "strategy type",
      () =>
        definition({
          strategy: {
            type: "UNKNOWN",
            targetMargin: "0.2",
            marginBase: "SELLING_PRICE",
          },
        }),
    ],
    [
      "margin base",
      () =>
        definition({
          strategy: {
            type: "GROSS_UP",
            targetMargin: "0.2",
            marginBase: "TOTAL_COST",
          },
        }),
    ],
    [
      "markup base",
      () =>
        definition({
          strategy: {
            type: "MARKUP_ON_COST",
            markup: "0.2",
            markupBase: "UNKNOWN",
          },
        }),
    ],
  ] as const)("rejects unknown %s", (_name, make) => {
    expectCode(
      () => calculatePricing(fixture({ definition: make() })),
      "INVALID_PRICING_DEFINITION"
    );
  });

  it.each(PRICING_CHARGE_KINDS)("accepts charge kind %s", kind => {
    const result = calculatePricing(
      fixture({
        definition: grossUp("0", [
          charge(ids.chargeA, "0", "TOTAL_COST", kind),
        ]),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("80");
  });

  it.each(PRICING_PERCENTAGE_BASES)("accepts percentage base %s", base => {
    const result = calculatePricing(
      fixture({
        definition: grossUp("0", [charge(ids.chargeA, "0", base, "OTHER")]),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("80");
  });

  it.each([
    ["amount number", "totalCost", 0.1],
    ["amount NaN", "totalCost", NaN],
    ["amount Infinity", "totalCost", Infinity],
    ["amount exponent", "totalCost", "1e2"],
    ["amount comma", "totalCost", "1,2"],
    ["amount whitespace", "totalCost", " 1 "],
    ["quantity number", "quantity", 0.1],
    ["quantity NaN", "quantity", NaN],
    ["quantity Infinity", "quantity", Infinity],
    ["quantity exponent", "quantity", "1e2"],
    ["quantity comma", "quantity", "1,2"],
    ["quantity whitespace", "quantity", " 1 "],
  ] as const)("rejects non-plain numeric input: %s", (_name, field, value) => {
    const valid = fixture();
    const changed =
      field === "totalCost"
        ? {
            ...valid,
            costBasis: {
              ...valid.costBasis,
              totalCost: { ...valid.costBasis.totalCost, amount: value },
            },
          }
        : {
            ...valid,
            costBasis: { ...valid.costBasis, commercialQuantity: value },
          };
    expectCode(
      () => calculatePricing(changed),
      "INVALID_PRICING_COST_BASIS"
    );
  });

  it("rejects negative quantity and incompatible currency", () => {
    const valid = fixture();
    expectCode(
      () =>
        calculatePricing({
          ...valid,
          costBasis: { ...valid.costBasis, commercialQuantity: "-1" },
        }),
      "INVALID_PRICING_COST_BASIS"
    );
    expectCode(
      () =>
        calculatePricing({
          ...valid,
          costBasis: {
            ...valid.costBasis,
            totalCost: { currency: "USD", amount: "80" },
          },
        }),
      "INVALID_PRICING_COST_BASIS"
    );
  });

  it("rejects an individual charge rate >= 1", () => {
    expectCode(
      () =>
        calculatePricing(
          fixture({
            definition: grossUp("0", [
              charge(ids.chargeA, "1", "SELLING_PRICE"),
            ]),
          })
        ),
      "INVALID_PRICING_DEFINITION"
    );
  });

  it("rejects selling-price charge sums >= 1", () => {
    expectCode(
      () =>
        calculatePricing(
          fixture({
            definition: grossUp("0", [
              charge(ids.chargeA, "0.6", "SELLING_PRICE"),
              charge(ids.chargeB, "0.4", "SELLING_PRICE"),
            ]),
          })
        ),
      "INVALID_PRICING_DENOMINATOR"
    );
  });

  it("accepts 64 charges and rejects 65", () => {
    const charges = Array.from({ length: MAX_PRICING_CHARGES }, (_, index) =>
      charge(
        `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        "0",
        "TOTAL_COST"
      )
    );
    expect(
      calculatePricing(
        fixture({ definition: grossUp("0", charges) })
      ).unroundedTotalSellingPrice.amount
    ).toBe("80");

    expectCode(
      () =>
        calculatePricing(
          fixture({
            definition: grossUp("0", [
              ...charges,
              charge(
                "60000000-0000-4000-8000-000000000999",
                "0",
                "TOTAL_COST"
              ),
            ]),
          })
        ),
      "PRICING_NUMERIC_LIMIT_EXCEEDED"
    );
  });
});

describe("Pricing 16B acceptance — decimal limits and exactness", () => {
  it("accepts 500 markup decimal places and rejects 501", () => {
    expect(pricingMarkup(`0.${"1".repeat(500)}`)).toBe(
      `0.${"1".repeat(500)}`
    );
    expectCode(
      () => pricingMarkup(`0.${"1".repeat(501)}`),
      "INVALID_PRICING_MARKUP"
    );
  });

  it("enforces the 1024/1025 text-length boundary independently", () => {
    const accepted = `1${"0".repeat(1000)}.${"1".repeat(22)}`;
    const rejected = `1${"0".repeat(1000)}.${"1".repeat(23)}`;
    expect(accepted.length).toBe(1024);
    expect(rejected.length).toBe(1025);
    expect(pricingMarkup(accepted)).toBe(accepted);
    expectCode(() => pricingMarkup(rejected), "INVALID_PRICING_MARKUP");
  });

  it("enforces the magnitude boundary independently", () => {
    const accepted = `1${"0".repeat(1000)}`;
    const rejected = `1${"0".repeat(1001)}`;
    expect(pricingMarkup(accepted)).toBe(accepted);
    expectCode(() => pricingMarkup(rejected), "INVALID_PRICING_MARKUP");
  });

  it("maps an operational result overflow to Pricing numeric-limit error", () => {
    const cost = `1${"0".repeat(1000)}`;
    const almostOne = `0.${"9".repeat(500)}`;
    expectCode(
      () =>
        calculatePricing(
          fixture({
            costBasis: {
              ...fixture().costBasis,
              totalCost: { currency: "BRL", amount: cost },
            },
            definition: grossUp("0", [
              charge(ids.chargeA, almostOne, "SELLING_PRICE"),
            ]),
          })
        ),
      "PRICING_NUMERIC_LIMIT_EXCEEDED"
    );
  });

  it("uses true half-even at 50 significant digits", () => {
    const evenTie = `1.${"0".repeat(48)}25`;
    const oddTie = `1.${"0".repeat(48)}35`;
    const evenExpected = `1.${"0".repeat(48)}2`;
    const oddExpected = `1.${"0".repeat(48)}4`;

    const even = calculatePricing(
      fixture({
        costBasis: {
          ...fixture().costBasis,
          totalCost: { currency: "BRL", amount: evenTie },
        },
        definition: grossUp("0"),
      })
    );
    const odd = calculatePricing(
      fixture({
        costBasis: {
          ...fixture().costBasis,
          totalCost: { currency: "BRL", amount: oddTie },
        },
        definition: grossUp("0"),
      })
    );
    expect(even.unroundedTotalSellingPrice.amount).toBe(evenExpected);
    expect(odd.unroundedTotalSellingPrice.amount).toBe(oddExpected);
  });

  it("handles carry during 50-digit half-even serialization", () => {
    const carry = `9.${"9".repeat(49)}5`;
    const result = calculatePricing(
      fixture({
        costBasis: {
          ...fixture().costBasis,
          totalCost: { currency: "BRL", amount: carry },
        },
        definition: grossUp("0"),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("10");
  });

  it("preserves commercial quantity as decimal text instead of floating point", () => {
    const quantity = "0.123456789012345678901234567890123456789";
    const result = calculatePricing(
      fixture({
        costBasis: { ...fixture().costBasis, commercialQuantity: quantity },
        definition: grossUp("0"),
      })
    );
    expect(result.commercialQuantity).toBe(quantity);
  });
});

describe("Pricing 16B acceptance — algebraic invariants", () => {
  it("is monotonic in gross-up margin", () => {
    const lower = calculatePricing(
      fixture({ definition: grossUp("0.1") })
    );
    const higher = calculatePricing(
      fixture({ definition: grossUp("0.2") })
    );
    expect(Number(higher.unroundedTotalSellingPrice.amount)).toBeGreaterThan(
      Number(lower.unroundedTotalSellingPrice.amount)
    );
  });

  it("is monotonic in markup", () => {
    const lower = calculatePricing(
      fixture({ definition: markup("0.1") })
    );
    const higher = calculatePricing(
      fixture({ definition: markup("0.2") })
    );
    expect(Number(higher.unroundedTotalSellingPrice.amount)).toBeGreaterThan(
      Number(lower.unroundedTotalSellingPrice.amount)
    );
  });

  it("treats a zero-rate charge as neutral", () => {
    const withoutCharge = calculatePricing(
      fixture({ definition: grossUp("0.2") })
    );
    const withZeroCharge = calculatePricing(
      fixture({
        definition: grossUp("0.2", [
          charge(ids.chargeA, "0", "SELLING_PRICE"),
        ]),
      })
    );
    expect(withZeroCharge.unroundedTotalSellingPrice).toEqual(
      withoutCharge.unroundedTotalSellingPrice
    );
    expect(withZeroCharge.breakdown.profitAmount).toEqual(
      withoutCharge.breakdown.profitAmount
    );
  });

  it("conserves exact profit on an exact mixed fixture", () => {
    const result = calculatePricing(
      fixture({
        definition: grossUp("0.3", [
          charge(ids.chargeA, "0.25", "TOTAL_COST", "TAX"),
          charge(ids.chargeB, "0.2", "SELLING_PRICE", "COMMISSION"),
        ]),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("200");
    expect(result.breakdown.totalCost.amount).toBe("80");
    expect(result.breakdown.costBasedCharges.amount).toBe("20");
    expect(result.breakdown.sellingPriceBasedCharges.amount).toBe("40");
    expect(result.breakdown.profitAmount.amount).toBe("60");
  });

  it("is deterministic for identical frozen input", () => {
    const value = fixture({
      definition: grossUp("0.2", [
        charge(ids.chargeA, "0.125", "TOTAL_COST", "TAX"),
        charge(ids.chargeB, "0.1", "SELLING_PRICE", "COMMISSION"),
      ]),
    });
    const first = calculatePricing(value);
    const second = calculatePricing(value);
    expect(second).toEqual(first);
  });

  it("returns a stable domain error for the same invalid denominator", () => {
    const value = fixture({
      definition: grossUp("0.3", [
        charge(ids.chargeA, "0.7", "SELLING_PRICE"),
      ]),
    });
    const first = expectCode(
      () => calculatePricing(value),
      "INVALID_PRICING_DENOMINATOR"
    );
    const second = expectCode(
      () => calculatePricing(value),
      "INVALID_PRICING_DENOMINATOR"
    );
    expect({ code: second.code, message: second.message }).toEqual({
      code: first.code,
      message: first.message,
    });
  });

  it("does not echo malformed financial payloads in operational errors", () => {
    const secret = "TOP_SECRET_FINANCIAL_PAYLOAD";
    const valid = fixture();
    const error = expectCode(
      () =>
        calculatePricing({
          ...valid,
          costBasis: {
            ...valid.costBasis,
            totalCost: { currency: "BRL", amount: secret },
          },
        }),
      "INVALID_PRICING_COST_BASIS"
    );
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.details ?? {})).not.toContain(secret);
  });
});

describe("Pricing 16B acceptance — public exports", () => {
  it("exposes the versioned engine contracts without changing schema version", () => {
    expect(PRICING_ENGINE_VERSION).toBe("1.0");
    expect(PRICING_TECHNICAL_PRECISION).toBe("DECIMAL_50_HALF_EVEN_V1");
    const result = calculatePricing(fixture({ definition: grossUp("0") }));
    expect(pricingEngineResultSchema.parse(result)).toEqual(result);
  });
});
