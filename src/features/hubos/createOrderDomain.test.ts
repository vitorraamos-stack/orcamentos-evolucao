import { describe, expect, it } from "vitest";
import {
  createOrderItemInputSchema,
  emptyOrderItem,
  getCreateOrderCompletion,
  normalizeCreateOrderItem,
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
  it("creates new items in centimeters", () => {
    expect(emptyOrderItem().unit).toBe("cm");
  });
  it("accepts only the item units exposed by the creation form", () => {
    expect(
      createOrderItemInputSchema.safeParse({ ...valid.items[0], unit: "cm" })
        .success
    ).toBe(true);
    const meters = createOrderItemInputSchema.safeParse({
      ...valid.items[0],
      unit: "m",
    });
    expect(meters.success).toBe(true);
    if (meters.success) expect(meters.data.unit).toBe("m");
    const invalid = createOrderItemInputSchema.safeParse({
      ...valid.items[0],
      unit: "un",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues[0]?.message).toBe("Selecione cm ou m.");
  });
  it("normalizes legacy units while preserving a meter selection", () => {
    expect(
      normalizeCreateOrderItem({ ...emptyOrderItem(), unit: "un" }).unit
    ).toBe("cm");
    expect(
      normalizeCreateOrderItem({ ...emptyOrderItem(), unit: "m" }).unit
    ).toBe("m");
  });
  it("validates operational items with shared limits", () => {
    expect(createOrderItemInputSchema.safeParse(valid.items[0]).success).toBe(
      true
    );
    expect(
      createOrderItemInputSchema.safeParse({
        ...valid.items[0],
        quantity: 0,
      }).success
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
