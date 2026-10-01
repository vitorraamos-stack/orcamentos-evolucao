import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { OperationalDashboardSections } from "./OperationalDashboardPage";

describe("OperationalDashboardSections", () => {
  it("renders the 12 cards with their canonical metric values", () => {
    const html = renderToStaticMarkup(
      <OperationalDashboardSections
        metrics={{
          active: 101,
          art: 102,
          approval: 103,
          production: 104,
          finish: 105,
          ready: 106,
          installations: 999,
          overdue: 110,
          today: 111,
          tomorrow: 112,
          letterBox: 0,
          externalProduction: 108,
          installationLoad: 0,
        }}
        attentionMetrics={{ awaitingSupplies: 107, financePending: 109 }}
      />
    );

    const cards = [
      ["OS ativas", 101],
      ["Em Arte", 102],
      ["Aguardando aprovação", 103],
      ["Em Produção", 104],
      ["Em Acabamento", 105],
      ["Material pronto", 106],
      ["Aguardando insumos", 107],
      ["Produção externa", 108],
      ["Financeiro", 109],
      ["Atrasadas", 110],
      ["Prazo hoje", 111],
      ["Prazo amanhã", 112],
    ] as const;
    for (const [label, value] of cards) {
      expect(html).toContain(label);
      expect(html).toContain(`>${value}</p>`);
    }
    expect(html).not.toContain("Instalações no período");
    expect(html.match(/border-l-4/g)).toHaveLength(12);
  });
});
