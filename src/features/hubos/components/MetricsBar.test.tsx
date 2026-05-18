import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MetricsBar from "./MetricsBar";

const baseProps = {
  global: 0,
  totalArte: 0,
  totalProducao: 0,
  overdue: 0,
  prontoAvisar: 0,
  instalacoes: 0,
  pendentes: 0,
};

describe("MetricsBar", () => {
  it("aplica destaque laranja suave no card Pronto/Avisar quando prontoAvisar > 0", () => {
    const html = renderToStaticMarkup(
      <MetricsBar {...baseProps} prontoAvisar={1} onProntoAvisarClick={vi.fn()} />
    );

    expect(html).toContain("Pronto/Avisar");
    expect(html).toContain("border-orange-300");
    expect(html).toContain("bg-orange-50");
    expect(html).toContain("text-orange-950");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("não aplica destaque laranja no card Pronto/Avisar quando prontoAvisar === 0", () => {
    const html = renderToStaticMarkup(
      <MetricsBar {...baseProps} prontoAvisar={0} onProntoAvisarClick={vi.fn()} />
    );

    const prontoAvisarSlice = html.split("Pronto/Avisar")[0];
    expect(prontoAvisarSlice).not.toContain("border-orange-300");
    expect(prontoAvisarSlice).not.toContain("bg-orange-50");
    expect(prontoAvisarSlice).not.toContain("text-orange-950");
  });

  it("mantém contrato de click e role=button quando onClick existe", () => {
    const html = renderToStaticMarkup(
      <MetricsBar {...baseProps} prontoAvisar={2} onProntoAvisarClick={vi.fn()} />
    );
    const source = readFileSync(
      "src/features/hubos/components/MetricsBar.tsx",
      "utf8"
    );

    expect(html).toContain('role="button"');
    expect(source).toContain("role={isInteractive ? \"button\" : undefined}");
    expect(source).toContain("onClick={onClick}");
  });

  it("mantém o attention vermelho em Aguardando Insumos", () => {
    const html = renderToStaticMarkup(
      <MetricsBar
        {...baseProps}
        aguardandoInsumos={2}
        insumosAlertActive
        onAguardandoInsumosClick={vi.fn()}
      />
    );

    expect(html).toContain("Aguardando Insumos");
    expect(html).toContain("border-red-300");
    expect(html).toContain("bg-red-50");
    expect(html).toContain("text-red-950");
    expect(html).toContain("animate-[inboxArrow_900ms_ease-in-out_infinite]");
  });
});
