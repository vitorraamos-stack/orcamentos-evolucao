import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const flow = readFileSync(new URL("./OrderFlowProgress.tsx", import.meta.url), "utf8");
const orientation = readFileSync(new URL("./OrderOrientationStrip.tsx", import.meta.url), "utf8");
describe("OS operational progress semantics", () => {
  it("uses canonical stages, labels the current stage and does not fabricate completions", () => {
    expect(flow).toContain("getOrderOperationalStage(order)");
    expect(flow).toContain('aria-current={isCurrent ? "step" : undefined}');
    expect(flow).toContain("isEarlier");
    expect(flow).not.toContain("isCompleted");
    expect(flow).not.toContain("Check className");
    expect((flow.match(/value: "(ENTRY|ART|APPROVAL|PRODUCTION|FINISHING|READY|LOGISTICS|FINISHED)"/g) ?? [])).toHaveLength(8);
  });
  it("provides only an informational route into production", () => {
    expect(orientation).toContain("Nenhuma tarefa foi presumida");
    expect(orientation).toContain("getOrderOperationalStage(order)");
    expect(orientation).toContain('onClick={onGoProduction}');
  });
});
