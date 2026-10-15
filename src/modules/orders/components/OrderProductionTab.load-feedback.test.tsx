import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrderProductionTab } from "./OrderProductionTab";

const base = {
  items: [], operations: [], users: [], canOperate: false, canManage: false,
  onCreate: vi.fn(), onUpdate: vi.fn(), onStatus: vi.fn(), onDelete: vi.fn(),
};

describe("OS production request feedback", () => {
  it("shows loading instead of a misleading empty state", () => {
    const html = renderToStaticMarkup(<OrderProductionTab {...base} loading />);
    expect(html).toContain("Carregando operações de produção");
    expect(html).not.toContain("Nenhuma operação");
  });

  it("shows an accessible error and retry control", () => {
    const html = renderToStaticMarkup(<OrderProductionTab {...base} error="Falha de rede" onRetry={vi.fn()} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Falha de rede");
    expect(html).toContain("Tentar novamente");
  });

  it("does not show retry when no callback was supplied", () => {
    const html = renderToStaticMarkup(<OrderProductionTab {...base} error="Falha" />);
    expect(html).not.toContain("Tentar novamente");
  });
});
