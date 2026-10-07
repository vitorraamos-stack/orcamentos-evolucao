import { describe, expect, it } from "vitest";
import {
  buildTechnicalInputs,
  hydrateQuoteFields,
  initialQuoteFields,
  normalizeUserDecimal,
  quoteEditableStateFingerprint,
  quoteFingerprint,
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

  it("creates the same fingerprint regardless of object key order", () => {
    expect(
      quoteFingerprint({
        request: {
          technicalInputs: {
            width: { kind: "decimal", value: "1", unit: "m" },
            height: { kind: "decimal", value: "2", unit: "m" },
          },
          commercialQuantity: "1",
        },
      })
    ).toBe(
      quoteFingerprint({
        request: {
          commercialQuantity: "1",
          technicalInputs: {
            height: { unit: "m", value: "2", kind: "decimal" },
            width: { unit: "m", value: "1", kind: "decimal" },
          },
        },
      })
    );
  });

  it("tracks only the editable Quote state for persisted dirty checks", () => {
    const base = {
      productVersionId: id(9),
      fieldValues: { width: "150.5", number_of_colors: "2" },
      fieldUnits: { width: "cm" as const, number_of_colors: null },
      quantity: "1",
      installments: "3",
      installationRequested: false,
      munckRequested: false,
      munckHours: "4",
      commercial: {
        customerName: " Cliente Teste ",
        customerPhone: " 48999999999 ",
        title: " Letreiro ",
      },
    };

    expect(quoteEditableStateFingerprint(base)).toBe(
      quoteEditableStateFingerprint({
        ...base,
        munckHours: "99",
        commercial: {
          customerName: "Cliente Teste",
          customerPhone: "48999999999",
          title: "Letreiro",
        },
      })
    );
    expect(
      quoteEditableStateFingerprint({
        ...base,
        fieldValues: { ...base.fieldValues, width: "151" },
      })
    ).not.toBe(quoteEditableStateFingerprint(base));
  });

  it("hydrates a persisted Quote back into editable fields", () => {
    const hydrated = hydrateQuoteFields(inputs, {
      width: { kind: "decimal", value: "150.5", unit: "cm" },
      number_of_colors: { kind: "decimal", value: "2", unit: null },
    });
    expect(hydrated.values.width).toBe("150.5");
    expect(hydrated.units.width).toBe("cm");
    expect(hydrated.values.number_of_colors).toBe("2");
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
