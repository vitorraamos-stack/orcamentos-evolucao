import { describe, expect, it } from "vitest";
import { isOrderUrgent } from "./orderUrgency";
describe("isOrderUrgent", () => {
  it("supports legacy URGENTE", () =>
    expect(
      isOrderUrgent({ art_direction_tag: "URGENTE", is_urgent: true })
    ).toBe(true));
  it("supports creation and ready art with independent urgency", () => {
    expect(
      isOrderUrgent({ art_direction_tag: "CRIACAO_ARTE", is_urgent: true })
    ).toBe(true);
    expect(
      isOrderUrgent({
        art_direction_tag: "ARTE_PRONTA_EDICAO",
        is_urgent: true,
      })
    ).toBe(true);
  });
  it("keeps normal orders normal", () =>
    expect(
      isOrderUrgent({ art_direction_tag: "CRIACAO_ARTE", is_urgent: false })
    ).toBe(false));
});
