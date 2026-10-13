import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "./OperationalUi";

const stylesheet = readFileSync(new URL("../styles/evolusystem-primitives.css", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../modules/dashboard/OperationalDashboardPage.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../../modules/orders/pages/OrdersCentralPage.tsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../../modules/orders/components/OrderSearch.tsx", import.meta.url), "utf8");

describe("EvoluSystem operational visual primitives", () => {
  it("shares accessible surface, filter, field and primary action primitives", () => {
    for (const part of ["panel", "filter-control", "field", "primary-action"]) {
      expect(stylesheet).toContain(`.evolu-ui-${part}`);
      expect(dashboard).toContain(`evolu-ui-${part}`);
    }
    expect(orders).toContain("evolu-ui-panel");
    expect(orders).toContain("evolu-ui-filter-control");
    expect(orders).toContain("evolu-ui-primary-action");
    expect(search).toContain("evolu-ui-field");
    expect(stylesheet).toContain(":focus-visible");
    expect(stylesheet).toContain("prefers-reduced-motion");
  });

  it("scopes tokens to operational screens, including dark mode", () => {
    expect(stylesheet).toContain(".evolu-dashboard, .evolu-orders");
    expect(stylesheet).toContain(".dark .evolu-dashboard, .dark .evolu-orders");
    expect(stylesheet).not.toContain("body {");
  });

  it("renders a standard, accessible retry action without changing callback contracts", () => {
    const html = renderToStaticMarkup(<ErrorState message="Falha de leitura" retry={() => {}} />);
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("Falha de leitura");
  });
});
