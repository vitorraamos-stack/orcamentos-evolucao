import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { OperationalDashboardSections } from "./OperationalDashboardPage";

describe("OperationalDashboardSections", () => {
  it("renders the 12 cards with their canonical metric values", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
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
          financeHref="/financeiro"
        />
      </Router>
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
    const destinations = [
      "/os?quick=active",
      "/os/arte",
      "/os/arte/aprovacoes",
      "/os/producao/em-producao",
      "/os/producao/acabamento",
      "/os/producao/pronto",
      "/os/producao/insumos",
      "/os/producao/externa",
      "/financeiro",
      "/os?quick=overdue",
      "/os?quick=today",
      "/os?quick=tomorrow",
    ];
    destinations.forEach(href =>
      expect(html).toContain(`href="${href.replaceAll("&", "&amp;")}"`)
    );
  });

  it("supports the permission-safe finance fallback", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <OperationalDashboardSections
          metrics={{
            active: 0,
            art: 0,
            approval: 0,
            production: 0,
            finish: 0,
            ready: 0,
            installations: 0,
            overdue: 0,
            today: 0,
            tomorrow: 0,
            letterBox: 0,
            externalProduction: 0,
            installationLoad: 0,
          }}
          attentionMetrics={{ awaitingSupplies: 0, financePending: 0 }}
          financeHref="/hub-os/pendentes"
        />
      </Router>
    );
    expect(html).toContain('href="/hub-os/pendentes"');
  });
});
