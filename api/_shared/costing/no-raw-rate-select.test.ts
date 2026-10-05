import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Costing runtime rate reads", () => {
  it("never selects authoritative numeric rates directly", () => {
    const runtime = ["../../costing.ts", "./service.ts", "./mappers.ts"]
      .map(path => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");
    for (const table of [
      "material_cost_rates",
      "process_cost_rates",
      "outsourced_service_cost_rates",
      "fixed_cost_rates",
    ])
      expect(runtime).not.toContain(table);
    expect(runtime).toContain("costing_get_rate_series_secure");
  });
});
