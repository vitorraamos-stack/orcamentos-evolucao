import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    hasModuleAccess: (key: string) => ["hub_os", "hub_os_dashboard", "hub_os_arte"].includes(key),
    hubPermissions: {
      canViewHubOS: true,
      canViewArteBoard: true, canViewProducaoBoard: false,
      canViewInstallations: false, canViewDeliveries: false,
    },
  }),
}));

import { buildDashboardOverview, type DashboardOrder } from "./dashboardModel";
import { OperationalDashboardSections } from "./OperationalDashboardPage";

const sample: DashboardOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  sale_number: "123", client_name: "Cliente Exemplo", title: "Letreiro",
  delivery_date: "2026-11-05", updated_at: "2026-11-05T12:00:00Z",
  prod_status: "Produção", art_status: "Produzir", production_tag: "EM_PRODUCAO",
  archived: false, is_urgent: false, art_direction_tag: null, logistic_type: "instalacao",
};

describe("Dashboard Etapa 1 — interface", () => {
  const overview = buildDashboardOverview([sample], new Date("2026-11-05T15:00:00Z"));

  it("renders the approved four indicators and one prioritized OS", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/hub-os">
        <OperationalDashboardSections overview={overview} assignments={[]} />
      </Router>
    );
    for (const label of ["OS ativas", "Exigem atenção", "Atrasadas", "Vencem hoje"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/evolu-dashboard__indicator--/g)).toHaveLength(4);
    expect(html).not.toContain("Pendências financeiras");
    expect(html).toContain('href="/os?quick=active"');
    expect(html).toContain('href="/os?quick=overdue"');
    expect(html).toContain("OS 123");
    expect(html).toContain('href="/os/' + sample.id + '"');
    expect(html).toContain("Responsável:");
    expect(html).toContain("Não informado");
    expect(html).toContain("Fluxo por setores");
    expect(html).toContain("Agenda operacional");
    expect(html).toContain("Próximos 7 dias");
    expect(html).toContain("Agenda completa");
    expect(html).toContain("evolu-dashboard__main");
    expect(html).toContain('href="/os/arte"');
    expect(html).not.toContain('href="/os/producao"');
  });

  it("does not misreport unavailable values as zero", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/hub-os">
        <OperationalDashboardSections overview={null} />
      </Router>
    );
    expect(html).toContain("Carregando prioridades");
    expect(html).toContain("—");
    expect(html).not.toContain("Nenhuma OS exige atenção no momento.");
  });

  it("identifies missing sale numbers and keeps direct links", () => {
    const missing = buildDashboardOverview([
      { ...sample, sale_number: "", client_name: "", delivery_date: null, is_urgent: true },
    ], new Date("2026-11-05T15:00:00Z"));
    const html = renderToStaticMarkup(
      <Router ssrPath="/hub-os">
        <OperationalDashboardSections overview={missing} assignments={[]} />
      </Router>
    );
    expect(html).toContain("Número não informado");
    expect(html).toContain("Cliente não informado");
    expect(html).toContain("Prazo:");
  });
});
