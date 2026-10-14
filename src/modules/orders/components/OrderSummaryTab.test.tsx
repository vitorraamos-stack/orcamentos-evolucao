import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import { OrderSummaryTab } from "./OrderSummaryTab";

function order(overrides: Partial<OsOrder> = {}): OsOrder {
  return {
    sale_number: "V-124",
    client_name: "Cliente de Teste",
    title: "Letreiro em ACM",
    description: "Produzir letreiro\ncom iluminação uniforme.",
    created_at: "2026-10-14T10:00:00.000Z",
    delivery_date: "2026-11-01",
    art_status: "Produzir",
    prod_status: "Produção",
    is_urgent: true,
    logistic_type: "instalacao",
    address: "Rua Exemplo, 123",
    production_tag: "PRODUCAO_EXTERNA",
    insumos_details: "Separar materiais",
    insumos_return_notes: "Retornar chapas",
    ...overrides,
  } as OsOrder;
}

describe("EvoluSystem OS detail summary without duplicated information", () => {
  it("displays the complementary briefing and metadata without repeating the header", () => {
    const html = renderToStaticMarkup(<OrderSummaryTab order={order()} />);
    expect(html).toContain("Informações complementares");
    expect(html).toContain("Briefing e orientações");
    expect(html).toContain("Produzir letreiro");
    expect(html).toContain("com iluminação uniforme.");
    expect(html).toContain("Número da venda");
    expect(html).toContain("V-124");
    expect(html).toContain("Criada em");
    expect(html).toContain("Endereço do serviço");
    expect(html).toContain("Rua Exemplo, 123");
    expect(html).not.toContain("Cliente de Teste");
    expect(html).not.toContain("Letreiro em ACM");
    expect(html).not.toContain("Prazo final");
    expect(html).not.toContain("Prioridade");
    expect(html).not.toContain("Logística");
  });

  it("preserves independent insumos notes and the external production flag", () => {
    const html = renderToStaticMarkup(<OrderSummaryTab order={order()} />);
    for (const value of [
      "Observações de insumos", "Separar materiais",
      "Retorno de insumos", "Retornar chapas", "Produção externa",
    ]) expect(html).toContain(value);
  });

  it("does not repeat description if it is already the header fallback", () => {
    const html = renderToStaticMarkup(
      <OrderSummaryTab order={order({
        title: null, description: "Texto exibido pelo cabeçalho",
        logistic_type: "retirada", address: null,
        insumos_details: null, insumos_return_notes: null,
        production_tag: null,
      })} />
    );
    expect(html).not.toContain("Briefing e orientações");
    expect(html).not.toContain("Texto exibido pelo cabeçalho");
    expect(html).not.toContain("Endereço do serviço");
    expect(html).not.toContain("Produção externa");
    expect(html).toContain("Número da venda");
  });

  it("keeps the address visible for delivery even when missing and does not hide a pickup address", () => {
    const missing = renderToStaticMarkup(
      <OrderSummaryTab order={order({ logistic_type: "entrega", address: null })} />
    );
    expect(missing).toContain("Endereço do serviço");
    const withPickupAddress = renderToStaticMarkup(
      <OrderSummaryTab order={order({ logistic_type: "retirada", address: "Local informado" })} />
    );
    expect(withPickupAddress).toContain("Local informado");
  });
});
