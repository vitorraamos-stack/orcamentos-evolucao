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

  it("keeps the eight stages readable in a compact timeline without implying completion", () => {
    const css = readFileSync(new URL("../pages/order-detail-premium.css", import.meta.url), "utf8");
    const compact = css.slice(css.indexOf("/* OS details: slightly larger reading text"));
    expect(compact).toContain(".evolu-detail__flow { padding: 9px 14px 7px; }");
    expect(compact).toContain(".evolu-detail__stage-bubble { width: 28px; height: 28px; }");
    expect(compact).toContain(".evolu-detail__stage-label {");
    expect(compact).toContain("font-size: 13px;");
    expect(compact).toContain(".evolu-detail__stage-label.font-bold { color: #086da8; }");
    expect(flow).toContain('aria-current={isCurrent ? "step" : undefined}');
    expect(flow).toContain("isEarlier");
    expect(flow).not.toContain("isCompleted");
  });
  it("increases text sizes only inside OS details and preserves dark-mode contrast", () => {
    const css = readFileSync(new URL("../pages/order-detail-premium.css", import.meta.url), "utf8");
    const compact = css.slice(css.indexOf("/* OS details: slightly larger reading text"));
    expect(compact).toContain(".evolu-detail__breadcrumb { font-size: 13px; }");
    expect(compact).toContain(".evolu-detail__tab { font-size: 14px; }");
    expect(compact).toContain(".evolu-detail__tab-content dl > div dt { font-size: 15px; }");
    expect(compact).toContain(".evolu-detail__tab-content dl > div dd { font-size: 17px; }");
    expect(compact).toContain(".dark .evolu-detail__stage-label.font-bold { color: #8cdaff; }");
  });
  it("provides only an informational route into production", () => {
    expect(orientation).toContain("Nenhuma tarefa foi presumida");
    expect(orientation).toContain("getOrderOperationalStage(order)");
    expect(orientation).toContain('onClick={onGoProduction}');
  });
});
