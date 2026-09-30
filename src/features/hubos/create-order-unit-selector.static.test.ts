import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/features/hubos/components/CreateOrderForm.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("new order item unit selector", () => {
  it("uses the design-system selector with only cm and m", () => {
    const unitField = source.slice(
      source.indexOf("<Label htmlFor={`item-${index}-measurement-unit`}>"),
      source.indexOf("<Label>Descrição / especificação</Label>")
    );

    expect(unitField).toContain("<Select");
    expect(unitField).toContain('<SelectItem value="cm">cm</SelectItem>');
    expect(unitField).toContain('<SelectItem value="m">m</SelectItem>');
    expect(unitField).not.toContain("<Input");
  });

  it("creates every additional item from the centimeter default", () => {
    expect(source).toContain(
      "{ ...emptyOrderItem(), sort_order: current.length }"
    );
  });

  it("normalizes restored legacy draft items", () => {
    expect(source).toContain("draft.items.map(normalizeCreateOrderItem)");
  });
});
