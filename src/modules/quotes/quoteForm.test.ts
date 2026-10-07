import { describe, expect, it } from "vitest";
import {
  buildTechnicalInputs,
  initialQuoteFields,
  normalizeUserDecimal,
  positiveUserDecimal,
} from "./quoteForm";
import type { ProductInput } from "@shared/product-engineering";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const inputs: ProductInput[] = [
  {
    id: id(1) as any,
    key: "width",
    label: "Largura",
    required: true,
    sortOrder: 0,
    type: "DECIMAL",
    unit: "m",
    min: "0.01" as any,
  },
  {
    id: id(2) as any,
    key: "number_of_colors",
    label: "Número de cores",
    required: true,
    sortOrder: 1,
    type: "DECIMAL",
    unit: null,
    defaultValue: "0" as any,
  },
];

describe("quote form helpers", () => {
  it("normalizes Brazilian decimal notation without using JS number", () => {
    expect(normalizeUserDecimal("1.234,50")).toBe("1234.5");
    expect(positiveUserDecimal("2,5", "Quantidade")).toBe("2.5");
  });

  it("prefers centimeters for dimensional meter inputs", () => {
    const initial = initialQuoteFields(inputs);
    expect(initial.units.width).toBe("cm");
    expect(initial.values.number_of_colors).toBe("0");
  });

  it("builds typed technical inputs using the selected unit", () => {
    const result = buildTechnicalInputs(
      inputs,
      { width: "150,5", number_of_colors: "2" },
      { width: "cm", number_of_colors: null }
    );
    expect(result.width).toEqual({
      kind: "decimal",
      value: "150.5",
      unit: "cm",
    });
    expect(result.number_of_colors).toEqual({
      kind: "decimal",
      value: "2",
      unit: null,
    });
  });
});
