import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const header = readFileSync(new URL("./OrderHeader.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../pages/order-detail-premium.css", import.meta.url), "utf8");

describe("Compact OS header", () => {
  it("groups identification into a compact horizontal line without hiding client or number", () => {
    expect(header).toContain('className="evolu-detail__identity"');
    expect(header).toContain("formatOfficialOsLabel(order.sale_number)");
    expect(header).toContain('className="evolu-detail__client break-words"');
    expect(header).toContain('className="evolu-detail__hero-secondary"');
    expect(header).toContain('className="sr-only">Ordem de serviço');
    expect(styles).toContain(".evolu-detail__identity {");
    expect(styles).toContain("flex-wrap: wrap;");
  });

  it("keeps the service, stage, risk, actions and operational quick-info visible", () => {
    for (const content of [
      "order.title || order.description", "getOperationalStatusLabel",
      "isOrderUrgent(order)", "OrderRiskBadge", "transitions.length > 0",
      "canEdit &&", "canManage && onArchive && onDelete &&",
      "Prazo final", "Responsável geral", "Logística",
    ]) expect(header).toContain(content);
    expect(styles).toContain(".evolu-detail__quick-info-item {");
    expect(styles).toContain("padding: 9px 14px;");
  });

  it("avoids a fixed height and retains responsive wrapping for long content", () => {
    expect(styles).toContain(".evolu-detail__hero-copy { min-width: 0;");
    expect(styles).toContain("flex: 1 1 320px;");
    expect(styles).toContain("@media (max-width: 850px)");
    expect(styles).not.toMatch(/\.evolu-detail__hero\s*\{[^}]*height:\s*[0-9]+px/);
  });
});
