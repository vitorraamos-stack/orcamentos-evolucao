import { describe, expect, it } from "vitest";
import { decimalFrom } from "../calculation-engine/decimal/index.js";
import {
  calculatePricing,
  pricingMarkup,
  pricingPolicyVersionDefinitionSchema,
  validatePricingPublicationReadiness,
  PricingDomainError,
} from "./index.js";

const ids = {
  policy: "10000000-0000-4000-8000-000000000001",
  version: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  chargeA: "10000000-0000-4000-8000-000000000004",
  chargeB: "10000000-0000-4000-8000-000000000005",
  product: "10000000-0000-4000-8000-000000000010",
  productVersion: "10000000-0000-4000-8000-000000000011",
};
const timestamp = "2026-01-02T03:04:05Z";

const policy = (status: "ACTIVE" | "INACTIVE" | "ARCHIVED" = "ACTIVE") => ({
  id: ids.policy,
  code: "TEST_POLICY_1",
  name: "Test policy",
  status,
});

const charge = (
  id: string,
  rate: string,
  percentageBase: "TOTAL_COST" | "SELLING_PRICE",
  kind: "TAX" | "COMMISSION" | "FINANCIAL_FEE" | "OTHER" = "OTHER"
) => ({ id, kind, rate, percentageBase });

function definition(options: {
  status?: "DRAFT" | "VALIDATING" | "PUBLISHED" | "RETIRED";
  policyId?: string;
  charges?: readonly ReturnType<typeof charge>[];
  strategy?:
    | { type: "GROSS_UP"; targetMargin: string; marginBase: "SELLING_PRICE" }
    | {
        type: "MARKUP_ON_COST";
        markup: string;
        markupBase: "TOTAL_COST" | "COST_PLUS_COST_BASED_CHARGES";
      };
} = {}) {
  const status = options.status ?? "PUBLISHED";
  const published = status === "PUBLISHED" || status === "RETIRED";
  return {
    schemaVersion: "1.0",
    version: {
      id: ids.version,
      pricingPolicyId: options.policyId ?? ids.policy,
      versionNumber: 2,
      revision: 3,
      status,
      createdAt: timestamp,
      createdBy: ids.user,
      publishedAt: published ? timestamp : null,
      publishedBy: published ? ids.user : null,
    },
    strategy:
      options.strategy ??
      ({
        type: "GROSS_UP",
        targetMargin: "0",
        marginBase: "SELLING_PRICE",
      } as const),
    charges: options.charges ?? [],
  };
}

function input(options: {
  cost?: string;
  quantity?: string;
  policyStatus?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  definition?: ReturnType<typeof definition> | Record<string, unknown>;
  costingAggregationVersion?: string;
} = {}) {
  return {
    policy: policy(options.policyStatus),
    definition: options.definition ?? definition(),
    costBasis: {
      totalCost: { currency: "BRL", amount: options.cost ?? "80" },
      productId: ids.product,
      productVersionId: ids.productVersion,
      productVersionNumber: 4,
      productVersionRevision: 5,
      costingAggregationVersion: options.costingAggregationVersion ?? "1.0",
      effectiveCostAt: timestamp,
      commercialQuantity: options.quantity ?? "1",
    },
  };
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PricingDomainError);
    expect(error).toHaveProperty("code", code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function grossUp(
  margin: string,
  charges: readonly ReturnType<typeof charge>[] = []
) {
  return definition({
    charges,
    strategy: {
      type: "GROSS_UP",
      targetMargin: margin,
      marginBase: "SELLING_PRICE",
    },
  });
}

function markup(
  value: string,
  base: "TOTAL_COST" | "COST_PLUS_COST_BASED_CHARGES",
  charges: readonly ReturnType<typeof charge>[] = []
) {
  return definition({
    charges,
    strategy: { type: "MARKUP_ON_COST", markup: value, markupBase: base },
  });
}

describe("Pricing 16B synthetic calculation matrix", () => {
  const cases = [
    ["identity", "80", grossUp("0"), "80"],
    ["margin only", "80", grossUp("0.2"), "100"],
    [
      "cost charge",
      "80",
      grossUp("0.2", [charge(ids.chargeA, "0.25", "TOTAL_COST")]),
      "125",
    ],
    [
      "selling charge",
      "80",
      grossUp("0", [charge(ids.chargeA, "0.2", "SELLING_PRICE")]),
      "100",
    ],
    [
      "mixed",
      "80",
      grossUp("0.3", [
        charge(ids.chargeA, "0.25", "TOTAL_COST"),
        charge(ids.chargeB, "0.2", "SELLING_PRICE"),
      ]),
      "200",
    ],
    [
      "markup on C",
      "80",
      markup("0.5", "TOTAL_COST", [
        charge(ids.chargeA, "0.25", "TOTAL_COST"),
        charge(ids.chargeB, "0.2", "SELLING_PRICE"),
      ]),
      "175",
    ],
    [
      "markup on B",
      "80",
      markup("0.5", "COST_PLUS_COST_BASED_CHARGES", [
        charge(ids.chargeA, "0.25", "TOTAL_COST"),
        charge(ids.chargeB, "0.2", "SELLING_PRICE"),
      ]),
      "187.5",
    ],
    ["markup >= 1", "80", markup("1.5", "TOTAL_COST"), "200"],
    ["short decimals", "0.1", markup("0.2", "TOTAL_COST"), "0.12"],
  ] as const;

  it.each(cases)("calculates %s", (_name, cost, def, expected) => {
    const result = calculatePricing(input({ cost, definition: def }));
    expect(result.unroundedTotalSellingPrice.amount).toBe(expected);
    expect(result.engineVersion).toBe("1.0");
    expect(result.schemaVersion).toBe("1.0");
    expect(result.technicalPrecision).toBe("DECIMAL_50_HALF_EVEN_V1");
  });

  it("serializes a periodic result to 50 significant digits", () => {
    const result = calculatePricing(
      input({ cost: "1", definition: grossUp("0.3") })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe(
      "1.4285714285714285714285714285714285714285714285714"
    );
  });

  it("keeps zero cost at zero and realized margin null", () => {
    const result = calculatePricing(
      input({
        cost: "0",
        definition: grossUp("0.3", [
          charge(ids.chargeA, "0.25", "TOTAL_COST"),
          charge(ids.chargeB, "0.2", "SELLING_PRICE"),
        ]),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("0");
    expect(result.breakdown.profitAmount.amount).toBe("0");
    expect(result.breakdown.realizedMargin).toBeNull();
  });

  it("does not multiply total cost by commercial quantity again", () => {
    const result = calculatePricing(
      input({ cost: "80", quantity: "4", definition: grossUp("0.2") })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe("100");
    expect(result.commercialQuantity).toBe("4");
  });

  it.each([
    grossUp("0.3", [charge(ids.chargeA, "0.7", "SELLING_PRICE")]),
    grossUp("0.3", [charge(ids.chargeA, "0.8", "SELLING_PRICE")]),
  ])("rejects non-positive gross-up denominators", def => {
    expectCode(
      () => calculatePricing(input({ definition: def })),
      "INVALID_PRICING_DENOMINATOR"
    );
  });

  it("does not collapse an extremely small positive denominator to zero", () => {
    const rate = `0.${"9".repeat(100)}`;
    const result = calculatePricing(
      input({
        cost: "1",
        definition: grossUp("0", [
          charge(ids.chargeA, rate, "SELLING_PRICE"),
        ]),
      })
    );
    expect(result.unroundedTotalSellingPrice.amount).toBe(`1${"0".repeat(100)}`);
  });
});

describe("Pricing 16B contracts and guards", () => {
  it.each(["DRAFT", "VALIDATING", "RETIRED"] as const)(
    "requires a PUBLISHED version for calculation: %s",
    status => {
      expectCode(
        () => calculatePricing(input({ definition: definition({ status }) })),
        "PRICING_POLICY_VERSION_NOT_PUBLISHED"
      );
    }
  );

  it.each(["INACTIVE", "ARCHIVED"] as const)(
    "requires an ACTIVE policy: %s",
    status => {
      expectCode(
        () => calculatePricing(input({ policyStatus: status })),
        "PRICING_POLICY_NOT_ACTIVE"
      );
    }
  );

  it("requires the version to belong to the policy", () => {
    expectCode(
      () =>
        calculatePricing(
          input({
            definition: definition({
              policyId: "20000000-0000-4000-8000-000000000001",
            }),
          })
        ),
      "PRICING_POLICY_VERSION_MISMATCH"
    );
  });

  it("rejects duplicate charge IDs but permits repeated kinds", () => {
    expectCode(
      () =>
        calculatePricing(
          input({
            definition: grossUp("0", [
              charge(ids.chargeA, "0.1", "TOTAL_COST", "TAX"),
              charge(ids.chargeA, "0.2", "SELLING_PRICE", "TAX"),
            ]),
          })
        ),
      "DUPLICATE_PRICING_CHARGE"
    );
    expect(() =>
      calculatePricing(
        input({
          definition: grossUp("0", [
            charge(ids.chargeA, "0.1", "TOTAL_COST", "TAX"),
            charge(ids.chargeB, "0.2", "SELLING_PRICE", "TAX"),
          ]),
        })
      )
    ).not.toThrow();
  });

  it.each([
    "-0.1",
    "1e-1",
    "1,5",
    " 1 ",
    `0.${"1".repeat(501)}`,
    NaN,
    Infinity,
    0.2,
  ])(
    "rejects invalid markup %s",
    value => expectCode(() => pricingMarkup(value), "INVALID_PRICING_MARKUP")
  );
  it.each(["0", "0.5", "1", "1.5", "10"])(
    "accepts non-negative markup %s",
    value => expect(pricingMarkup(value)).toBe(value)
  );

  it("enforces the technical charge collection limit", () => {
    const charges = Array.from({ length: 65 }, (_, index) =>
      charge(
        `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        "0",
        "TOTAL_COST"
      )
    );
    expectCode(
      () => calculatePricing(input({ definition: grossUp("0", charges) })),
      "PRICING_NUMERIC_LIMIT_EXCEEDED"
    );
  });

  it("keeps strategies strict and mutually exclusive", () => {
    expect(
      pricingPolicyVersionDefinitionSchema.safeParse({
        ...grossUp("0.2"),
        strategy: {
          type: "GROSS_UP",
          targetMargin: "0.2",
          marginBase: "SELLING_PRICE",
          markup: "0.5",
        },
      }).success
    ).toBe(false);
    expect(
      pricingPolicyVersionDefinitionSchema.safeParse({
        ...markup("0.5", "TOTAL_COST"),
        strategy: {
          type: "MARKUP_ON_COST",
          markup: "0.5",
          markupBase: "TOTAL_COST",
          targetMargin: "0.2",
        },
      }).success
    ).toBe(false);
  });

  it("does not default a missing charges collection", () => {
    const { charges: _omitted, ...missing } = definition();
    expectCode(
      () => calculatePricing(input({ definition: missing })),
      "INVALID_PRICING_DEFINITION"
    );
  });

  it("rejects invalid cost basis values", () => {
    expectCode(
      () => calculatePricing(input({ cost: "-1" })),
      "INVALID_PRICING_COST_BASIS"
    );
    expectCode(
      () => calculatePricing(input({ quantity: "0" })),
      "INVALID_PRICING_COST_BASIS"
    );
  });

  it("reports unsupported schema and aggregation versions explicitly", () => {
    expectCode(
      () =>
        calculatePricing(
          input({ definition: { ...definition(), schemaVersion: "2.0" } })
        ),
      "UNSUPPORTED_PRICING_SCHEMA_VERSION"
    );
    expectCode(
      () => calculatePricing(input({ costingAggregationVersion: "2.0" })),
      "UNSUPPORTED_COSTING_AGGREGATION_VERSION"
    );
  });

  it("is invariant to charge order", () => {
    const first = charge(ids.chargeA, "0.125", "TOTAL_COST", "TAX");
    const second = charge(ids.chargeB, "0.2", "SELLING_PRICE", "COMMISSION");
    const left = calculatePricing(
      input({ definition: grossUp("0.15", [first, second]) })
    );
    const right = calculatePricing(
      input({ definition: grossUp("0.15", [second, first]) })
    );
    expect(left.unroundedTotalSellingPrice).toEqual(
      right.unroundedTotalSellingPrice
    );
    expect(left.breakdown).toEqual(right.breakdown);
  });

  it("does not mutate deeply frozen input", () => {
    const value = input({
      definition: grossUp("0.2", [
        charge(ids.chargeA, "0.1", "TOTAL_COST"),
      ]),
    });
    const freeze = (target: unknown): unknown => {
      if (typeof target !== "object" || target === null) return target;
      Object.freeze(target);
      for (const item of Object.values(target)) freeze(item);
      return target;
    };
    freeze(value);
    expect(() => calculatePricing(value)).not.toThrow();
  });

  it("is monotonic in cost and homogeneous when policy is unchanged", () => {
    const def = grossUp("0.2", [
      charge(ids.chargeA, "0.1", "TOTAL_COST"),
      charge(ids.chargeB, "0.1", "SELLING_PRICE"),
    ]);
    const one = calculatePricing(input({ cost: "10", definition: def }));
    const two = calculatePricing(input({ cost: "20", definition: def }));
    expect(
      decimalFrom(two.unroundedTotalSellingPrice.amount).comparedTo(
        decimalFrom(one.unroundedTotalSellingPrice.amount)
      )
    ).toBeGreaterThan(0);
    expect(two.unroundedTotalSellingPrice.amount).toBe(
      "31.428571428571428571428571428571428571428571428571"
    );
  });
});

describe("Pricing publication readiness", () => {
  it.each(["DRAFT", "VALIDATING"] as const)(
    "accepts %s without forging PUBLISHED metadata",
    status => {
      const result = validatePricingPublicationReadiness(
        policy(),
        definition({ status })
      );
      expect(result).toEqual({ ready: true, issues: [] });
    }
  );

  it("does not treat an already PUBLISHED version as publication readiness input", () => {
    const result = validatePricingPublicationReadiness(policy(), definition());
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual({
      code: "INVALID_VERSION_STATUS",
      path: "version.status",
    });
  });

  it("finds policy mismatch and invalid denominator without real cost", () => {
    const result = validatePricingPublicationReadiness(
      policy(),
      definition({
        status: "VALIDATING",
        policyId: "20000000-0000-4000-8000-000000000001",
        charges: [charge(ids.chargeA, "0.8", "SELLING_PRICE")],
        strategy: {
          type: "GROSS_UP",
          targetMargin: "0.3",
          marginBase: "SELLING_PRICE",
        },
      })
    );
    expect(result.ready).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual([
      "POLICY_VERSION_MISMATCH",
      "INVALID_DENOMINATOR",
    ]);
  });
});
