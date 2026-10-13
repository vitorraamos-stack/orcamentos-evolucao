import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderPriorityBadge, OrderRiskBadge, OrderStatusBadge } from "./OrderBadges";

const table = readFileSync(new URL("../../modules/orders/components/OrderTable.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../modules/orders/pages/orders-central.css", import.meta.url), "utf8");

describe("EvoluSystem OS table and status indicators", () => {
  it("keeps the existing risk wording while exposing a semantic tone", () => {
    const cases = [
      { risk: "NORMAL" as const, tone: "success", label: "NORMAL" },
      { risk: "ATENCAO" as const, tone: "warning", label: "ATENÇÃO" },
      { risk: "CRITICO" as const, tone: "danger", label: "CRITICO" },
    ];
    for (const { risk, tone, label } of cases) {
      const html = renderToStaticMarkup(<OrderRiskBadge risk={risk} />);
      expect(html).toContain('data-order-indicator="risk"');
      expect(html).toContain(`data-tone="${tone}"`);
      expect(html).toContain(label);
    }
  });

  it("retains full status labels for clipped badges and safe fallbacks", () => {
    const alert = renderToStaticMarkup(<OrderStatusBadge status="Ajustes" />);
    expect(alert).toContain('title="Ajustes"');
    expect(alert).toContain('data-tone="warning"');
    const unknown = renderToStaticMarkup(<OrderStatusBadge status="Etapa futura" />);
    expect(unknown).toContain('data-tone="neutral"');
    expect(unknown).toContain('title="Etapa futura"');
    const missing = renderToStaticMarkup(<OrderStatusBadge status={null} />);
    expect(missing).toContain("Entrada");
  });

  it("keeps both priority labels with distinct danger and neutral tones", () => {
    const urgent = renderToStaticMarkup(<OrderPriorityBadge urgent />);
    const normal = renderToStaticMarkup(<OrderPriorityBadge urgent={false} />);
    expect(urgent).toContain('data-tone="danger"');
    expect(urgent).toContain("Urgente");
    expect(normal).toContain('data-tone="neutral"');
    expect(normal).toContain("Normal");
  });

  it("improves desktop table semantics and keyboard focus without changing order actions", () => {
    expect(table).toContain('<caption className="sr-only">');
    expect(table).toContain('scope="col"');
    expect(table).toContain('href={path}');
    expect(table).toContain("onClick={onClearFilters}");
    expect(css).toContain("tbody tr:focus-within");
    expect(css).toContain(".evolu-orders__mobile-card:focus-within");
    expect(css).toContain(".dark .evolu-orders [data-order-indicator]");
  });
});
