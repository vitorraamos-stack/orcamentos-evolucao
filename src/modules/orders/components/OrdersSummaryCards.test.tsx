import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersSummaryCards } from "./OrdersSummaryCards";

const handlers = {
  onRetry: () => undefined,
  onSelectUrgent: () => undefined,
  selectedUrgent: false,
};

describe("Central de OS — indicadores globais independentes", () => {
  it("shows exactly the three approved indicators", () => {
    const html = renderToStaticMarkup(
      <OrdersSummaryCards
        {...handlers}
        summary={{ total: 10, active: 6, overdue: 2, urgent: 1, finished: 4 }}
        loading={false}
        error={false}
      />
    );
    expect(html.match(/data-slot="card"/g)).toHaveLength(3);
    expect(html).toContain("Em andamento");
    expect(html).toContain("Atrasadas");
    expect(html).toContain("Urgentes");
    expect(html).not.toContain("Total de OS");
    expect(html).not.toContain("Finalizadas");
    expect(html).toContain('aria-label="Filtrar ordens urgentes"');
  });

  it("never substitutes a zero for unavailable or failed global counts", () => {
    const html = renderToStaticMarkup(
      <OrdersSummaryCards {...handlers} summary={null} loading={false} error={true} />
    );
    expect(html.match(/>—</g)).toHaveLength(3);
    expect(html).toContain("Não foi possível atualizar os indicadores globais.");
    expect(html).toContain("Tentar novamente");
  });

  it("announces loading without displaying an unverified total", () => {
    const html = renderToStaticMarkup(
      <OrdersSummaryCards {...handlers} summary={null} loading={true} error={false} />
    );
    expect(html).toContain("Atualizando indicadores globais.");
    expect(html.match(/>—</g)).toHaveLength(3);
  });
});
