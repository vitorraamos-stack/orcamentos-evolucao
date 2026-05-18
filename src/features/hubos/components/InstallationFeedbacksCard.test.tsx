import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InstallationFeedbacksCard from "./InstallationFeedbacksCard";

const baseItem = {
  id: "1",
  order_key: "os_orders:1",
  source_type: "os_orders" as const,
  source_id: "abc",
  os_number: 123,
  sale_number: "V-1",
  client_name: "Cliente",
  title: "Título",
  feedback: "Tudo certo",
  created_by: null,
  created_at: new Date().toISOString(),
  finalized_at: new Date().toISOString(),
  reviewed: false,
  reviewed_at: null,
  reviewed_by: null,
  reviewed_by_email: null,
};

describe("InstallationFeedbacksCard", () => {
  it("aplica destaque laranja quando há feedbacks pendentes", () => {
    const html = renderToStaticMarkup(
      <InstallationFeedbacksCard items={[baseItem]} />
    );

    expect(html).toContain("animate-pulse");
    expect(html).toContain("Feedbacks Instalações");
  });

  it("não aplica destaque quando não há feedbacks", () => {
    const html = renderToStaticMarkup(<InstallationFeedbacksCard items={[]} />);

    expect(html).not.toContain("animate-pulse");
  });

  it("não pulsa quando todos os feedbacks já foram revisados", () => {
    const html = renderToStaticMarkup(
      <InstallationFeedbacksCard items={[{ ...baseItem, reviewed: true }]} />
    );

    expect(html).not.toContain("animate-pulse");
    expect(html).toContain("0 pendentes");
  });

  it("mantém abas de pendentes/revisados e ação de revisão no modal", () => {
    const source = readFileSync(
      "src/features/hubos/components/InstallationFeedbacksCard.tsx",
      "utf8"
    );

    expect(source).toContain("sm:max-w-6xl");
    expect(source).toContain('TabsTrigger value="pending"');
    expect(source).toContain('TabsTrigger value="reviewed"');
    expect(source).toContain('"Revisar"');
  });

  it("formata a origem e preserva espaço para o botão de fechar", () => {
    const source = readFileSync(
      "src/features/hubos/components/InstallationFeedbacksCard.tsx",
      "utf8"
    );

    expect(source).toContain("Ordem de Serviço");
    expect(source).toContain('os: "OS"');
    expect(source).toContain("Origem: {formatSourceType(selected.source_type)}");
    expect(source).not.toContain("Origem: {selected.source_type}");
    expect(source).toContain("sm:pr-20");
    expect(source).toContain("flex shrink-0 flex-wrap gap-2 sm:justify-end");
    expect(source).not.toContain("pr-12 text-left sm:px-6");
  });

  it("não reintroduz nomes de declarações que quebraram o deploy", () => {
    const source = readFileSync(
      "src/features/hubos/components/InstallationFeedbacksCard.tsx",
      "utf8"
    );
    const countMatches = (pattern: RegExp) =>
      source.match(pattern)?.length ?? 0;

    expect(countMatches(/const\s+feedbackCounts\s*=/g)).toBe(1);
    expect(countMatches(/const\s+reviewSelectedFeedback\s*=/g)).toBe(1);
    expect(countMatches(/const\s+renderInstallationFeedbackList\s*=/g)).toBe(1);
    expect(countMatches(/const\s+(pendingCount|reviewedCount)\s*=/g)).toBe(0);
    expect(countMatches(/const\s+(handleReview|renderFeedbackList)\s*=/g)).toBe(
      0
    );
  });
});
