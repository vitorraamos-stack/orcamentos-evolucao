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
      source.indexOf("<Label htmlFor={`item-${index}-description`}>")
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

  it("uses whole-unit increments for the quantity spinner", () => {
    const quantityField = source.slice(
      source.indexOf("<Label htmlFor={`item-${index}-quantity`}>"),
      source.indexOf("<Label htmlFor={`item-${index}-width`}>")
    );

    expect(quantityField).toContain('inputMode="numeric"');
    expect(quantityField).toContain('min="1"');
    expect(quantityField).toContain('step="1"');
    expect(quantityField).not.toContain('step="0.001"');
  });

  it("keeps product count and displays each quantity in both summaries", () => {
    expect(source.match(/items=\{items\}/g)).toHaveLength(2);
    expect(source).toContain("items: CreateOrderItemDraft[];");
    expect(source).toContain("const itemCount = items.length;");
    expect(source).toContain("items.map((item, index) => (");
    expect(source).toContain("formatOrderItemQuantity(item.quantity)");
    const summaryItems = source.slice(
      source.indexOf('aria-label="Quantidade por produto"'),
      source.indexOf("</ul>", source.indexOf('aria-label="Quantidade por produto"'))
    );
    expect(summaryItems).toContain('className="break-words text-sm leading-5 text-muted-foreground"');
    expect(summaryItems).toContain('{" - "}');
    expect(summaryItems).not.toContain("justify-between");
    expect(summaryItems).not.toContain("shrink-0");

  });

  it("normalizes restored legacy draft items", () => {
    expect(source).toContain("draft.items.map(normalizeCreateOrderItem)");
  });
});
