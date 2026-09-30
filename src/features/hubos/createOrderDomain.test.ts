import { describe, expect, it } from "vitest";
import {
  createOrderItemInputSchema,
  emptyOrderItem,
  getCreateOrderCompletion,
  normalizeCreateOrderItem,
  normalizeMeasurementToCm,
  toCreateOrderItemPayload,
} from "./createOrderDomain";

const valid = {
  saleNumber: "84756",
  clientName: "Cliente XPTO",
  description: "Criar identidade visual",
  items: [{ ...emptyOrderItem(), name: "Placa em ACM" }],
  artDirectionTag: "CRIACAO_ARTE" as const,
  deadlinePreset: "STANDARD_8_12" as const,
  deliveryDate: "",
  logisticType: "retirada" as const,
  address: "",
};
describe("create order domain", () => {
  it("creates new items with centimeter input and canonical quantity unit", () => {
    expect(emptyOrderItem()).toMatchObject({
      measurement_unit: "cm",
      unit: "un",
    });
  });
  it("accepts only cm and m as measurement units", () => {
    expect(createOrderItemInputSchema.safeParse(valid.items[0]).success).toBe(
      true
    );
    expect(
      createOrderItemInputSchema.safeParse({
        ...valid.items[0],
        measurement_unit: "m",
      }).success
    ).toBe(true);
    const invalid = createOrderItemInputSchema.safeParse({
      ...valid.items[0],
      measurement_unit: "un",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues[0]?.message).toBe("Selecione cm ou m.");
  });
  it("restores legacy meter and centimeter drafts with a canonical unit", () => {
    const legacyBase = { ...emptyOrderItem() } as Record<string, unknown>;
    delete legacyBase.measurement_unit;
    expect(
      normalizeCreateOrderItem({ ...legacyBase, unit: "m" } as never)
    ).toMatchObject({ measurement_unit: "m", unit: "un" });
    expect(
      normalizeCreateOrderItem({ ...legacyBase, unit: "cm" } as never)
    ).toMatchObject({ measurement_unit: "cm", unit: "un" });
  });
  it("prefers an existing measurement unit when restoring a draft", () => {
    expect(
      normalizeCreateOrderItem({
        ...emptyOrderItem(),
        measurement_unit: "m",
        unit: "cm",
      })
    ).toMatchObject({ measurement_unit: "m", unit: "un" });
  });
  it("normalizes measurements to centimeters without floating-point noise", () => {
    expect(normalizeMeasurementToCm(null, "m")).toBeNull();
    expect(normalizeMeasurementToCm(undefined, "m")).toBeNull();
    expect(normalizeMeasurementToCm(90, "cm")).toBe(90);
    expect(normalizeMeasurementToCm(0.5, "m")).toBe(50);
    expect(normalizeMeasurementToCm(1.2, "m")).toBe(120);
  });
  it.each([
    ["cm", 90, 80, 90, 80],
    ["m", 1.2, 1.5, 120, 150],
  ] as const)(
    "maps %s dimensions to a canonical payload",
    (measurement_unit, width_cm, height_cm, expectedWidth, expectedHeight) => {
      const parsed = createOrderItemInputSchema.parse({
        ...valid.items[0],
        quantity: 2,
        measurement_unit,
        width_cm,
        height_cm,
      });
      const payload = toCreateOrderItemPayload(parsed);
      expect(payload).toMatchObject({
        quantity: 2,
        width_cm: expectedWidth,
        height_cm: expectedHeight,
        unit: "un",
      });
      expect(payload).not.toHaveProperty("measurement_unit");
    }
  );
  it("validates operational items with shared limits", () => {
    expect(createOrderItemInputSchema.safeParse(valid.items[0]).success).toBe(
      true
    );
    expect(
      createOrderItemInputSchema.safeParse({ ...valid.items[0], quantity: 0 })
        .success
    ).toBe(false);
  });
  it("marks every normal-create section complete", () =>
    expect(getCreateOrderCompletion(valid)).toEqual({
      identification: true,
      items: true,
      briefing: true,
      artwork: true,
      deadline: true,
      logistics: true,
    }));
  it("requires a custom date and service address", () => {
    expect(
      getCreateOrderCompletion({
        ...valid,
        deadlinePreset: "CUSTOM",
        logisticType: "entrega",
      }).deadline
    ).toBe(false);
    expect(
      getCreateOrderCompletion({ ...valid, logisticType: "instalacao" })
        .logistics
    ).toBe(false);
  });
  it("allows pickup without address", () =>
    expect(getCreateOrderCompletion(valid).logistics).toBe(true));
  it("rejects missing art and invalid/removed items", () => {
    expect(
      getCreateOrderCompletion({ ...valid, artDirectionTag: null }).artwork
    ).toBe(false);
    expect(getCreateOrderCompletion({ ...valid, items: [] }).items).toBe(false);
  });
});
