import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("official costing orchestration static boundary", () => {
  const source = readFileSync(
    new URL("./calculationService.ts", import.meta.url),
    "utf8"
  );

  it("uses service loaders instead of raw product or rate tables", () => {
    expect(source).toContain("loadDefinition(");
    expect(source).toContain("loadResource(");
    for (const forbidden of [
      "material_cost_rates",
      "process_cost_rates",
      "outsourced_service_cost_rates",
      "fixed_cost_rates",
      "product_versions",
      "product_inputs",
      "product_variables",
      "product_components",
    ])
      expect(source).not.toContain(forbidden);
  });
});
