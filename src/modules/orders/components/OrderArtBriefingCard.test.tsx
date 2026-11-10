import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import { OrderArtBriefingCard } from "./OrderArtBriefingCard";

const makeOrder = (description: string | null, title: string | null = null) => ({
  description,
  title,
} as OsOrder);

describe("Briefing de Arte no resumo da OS", () => {
  it("shows the saved briefing even when the order has no separate title", () => {
    const html = renderToStaticMarkup(<OrderArtBriefingCard order={makeOrder("Criar arte e enviar para aprovação.")} />);
    expect(html).toContain("Briefing de Arte");
    expect(html).toContain("Criar arte e enviar para aprovação.");
    expect(html).not.toContain("Nenhum briefing");
  });

  it("shows the saved briefing even when title is equal to description", () => {
    const html = renderToStaticMarkup(
      <OrderArtBriefingCard order={makeOrder("Criar arte.", "Criar arte.")} />
    );
    expect(html).toContain("Criar arte.");
  });

  it("preserves the source line breaks with pre-wrap styling and no clipping", () => {
    const html = renderToStaticMarkup(
      <OrderArtBriefingCard order={makeOrder("Primeira linha\nSegunda linha\n\nObservação final")} />
    );
    expect(html).toContain("Primeira linha\nSegunda linha\n\nObservação final");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("break-words");
  });

  it("gives a clear empty state for older orders without a briefing", () => {
    const html = renderToStaticMarkup(<OrderArtBriefingCard order={makeOrder(null)} />);
    expect(html).toContain("Nenhum briefing de arte informado.");
  });
});
