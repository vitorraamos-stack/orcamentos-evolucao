import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import type { AgendaEvent } from "./dashboardAgenda";
import { assessOrderPreparation } from "./dashboardPreparation";
import { PreparationBadge } from "./DashboardPreparationBadge";

const order: DashboardOrder = {
  id: "os1", sale_number: "501", client_name: "Cliente", title: "Letreiro",
  delivery_date: "2026-11-06", updated_at: "2026-11-06T09:00:00Z",
  prod_status: "Instalação Agendada", art_status: "Produzir",
  production_tag: "AGUARDANDO_INSUMOS", logistic_type: "instalacao",
  archived: false, is_urgent: false, art_direction_tag: null,
};
const event: AgendaEvent = {
  key: "installation:a", kind: "installation", order, dateKey: "2026-11-06",
  when: "2026-11-06T14:00:00Z", hasTime: true, label: "Instalação",
  status: "Agendada", warnings: ["Endereço não informado", "Conflito de horário registrado"],
  overdueWithoutCompletion: false, conflict: true,
};
const ready = assessOrderPreparation(order, [{
  id: "item1", order_id: "os1", name: "Item", status: "READY", updated_at: "2026-11-06T12:00:00Z",
}], []);

describe("Dashboard Etapa 3 — apresentação consultiva", () => {
  it("shows one principal alert, production/material distinction and expandable details", () => {
    const html = renderToStaticMarkup(<PreparationBadge preparation={ready} event={event}
      now={new Date("2026-11-06T12:00:00Z")} />);
    expect(html).toContain("Prontidão: Pendente");
    expect(html).toContain("Produção pronta");
    expect(html).toContain("Materiais pendentes");
    expect(html).toContain("Materiais aguardando insumos");
    expect(html).toContain("Ver detalhes da preparação");
    expect(html).toContain("Conflito de horário registrado");
    expect(html).toContain("Endereço não informado");
    expect(html).toContain("Não há reserva de materiais comprovada");
    expect((html.match(/evolu-dashboard__prep-main-alert/g) ?? [])).toHaveLength(1);
  });

  it("does not present an unverified source as ready", () => {
    const unknown = assessOrderPreparation({ ...order, production_tag: "PRONTO" }, [], []);
    const html = renderToStaticMarkup(<PreparationBadge preparation={unknown} />);
    expect(html).toContain("Prontidão: Não verificada");
    expect(html).toContain("Materiais não verificados");
  });

  it("keeps loading explicitly separate from not verified", () => {
    expect(renderToStaticMarkup(<PreparationBadge preparation={null} />)).toContain("Prontidão: consultando");
  });
});
