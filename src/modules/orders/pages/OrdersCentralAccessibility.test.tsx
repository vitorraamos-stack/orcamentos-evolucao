import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrdersSummaryCards } from "../components/OrdersSummaryCards";

const page = readFileSync(new URL("./OrdersCentralPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./orders-central.css", import.meta.url), "utf8");

describe("Central de OS — stage 6 accessibility guardrails", () => {
  it("provides names for every advanced filter and both paging directions", () => {
    for (const name of [
      "Filtrar etapa de arte",
      "Filtrar etapa de produção",
      "Filtrar prioridade",
      "Filtrar logística",
      "Paginação das ordens",
      "Página anterior",
      "Próxima página",
    ]) expect(page).toContain(`aria-label="${name}"`);
    expect(page).toContain('className="sr-only sm:not-sr-only" aria-current="page"');
  });

  it("uses an actual bounded promise race instead of relying only on abort", () => {
    expect(page).toContain("boundedCentralLookup(");
    expect(page).toContain('outcome.status === "found"');
    expect(page).toContain("timedOut = true");
    expect(page).toContain("return await listOperationalOrders(args)");
    expect(page).not.toContain("const timeout = window.setTimeout(() =>");
    expect(page).toContain("if (requestId !== listRequestId.current) return;");
  });

  it("provides one-shot nonintrusive screen-reader context on successful return", () => {
    expect(page).toContain("Ordem anteriormente aberta localizada nos resultados.");
    expect(page).toContain("pendingAnchorFocusRef.current = null");
    expect(page).toContain('target?.focus({ preventScroll: true })');
    expect(css).toContain("a[data-central-order-id]:focus-visible");
  });

  it("reflows cards below 420px and keeps an error across the full grid", () => {
    const html = renderToStaticMarkup(
      <OrdersSummaryCards
        summary={null}
        loading={false}
        error={true}
        onRetry={() => undefined}
        onSelectUrgent={() => undefined}
        selectedUrgent={false}
      />
    );
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("min-[420px]:grid-cols-3");
    expect(html).toContain("col-span-full");
    expect(css).toContain("@media (max-width: 419px)");
    expect(css).toContain("min-height: 44px");
  });
});
