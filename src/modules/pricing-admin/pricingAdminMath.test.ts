import { describe, expect, it } from "vitest";
import {
  markupToMultiplier,
  multiplierToMarkup,
  nonNegativeAmount,
  percentToRate,
  rateToPercent,
} from "./pricingAdminMath";

describe("pricing admin decimal helpers", () => {
  it("converts the commercial multiplier without binary floating point", () => {
    expect(markupToMultiplier("2")).toBe("3");
    expect(multiplierToMarkup("3,0")).toBe("2");
  });

  it("converts payment percentages to persisted rates", () => {
    expect(percentToRate("5,5")).toBe("0.055");
    expect(rateToPercent("0.055")).toBe("5.5");
  });

  it("rejects negative commercial values", () => {
    expect(() => nonNegativeAmount("-0.01")).toThrow();
    expect(() => multiplierToMarkup("0.99")).toThrow();
  });
});
