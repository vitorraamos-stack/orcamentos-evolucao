import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderDetailShortcuts } from "../components/OrderDetailShortcuts";

const page = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");

describe("EvoluSystem OS detail quick navigation", () => {
  it("renders accessible shortcuts for three existing tabs and operational management", () => {
    const markup = renderToStaticMarkup(
      <OrderDetailShortcuts onOpenTab={vi.fn()} onOpenManagement={vi.fn()} />
    );
    expect(markup).toContain('aria-label="Acessos rápidos da Ordem de Serviço"');
    for (const label of ["Itens do pedido", "Produção", "Arquivos", "Responsáveis e prazos"]) {
      expect(markup).toContain(label);
    }
    expect((markup.match(/type="button"/g) ?? []).length).toBe(4);
  });

  it("connects shortcuts to controlled tabs and preserves existing lazy loading", () => {
    expect(page).toContain('const [activeTab, setActiveTab] = useState("summary")');
    expect(page).toContain('value={activeTab} onValueChange={changeTab}');
    expect(page).toContain('const changeTab = (value: string) => { setActiveTab(value); void loadTab(value); };');
    expect(page).toContain('<OrderDetailShortcuts onOpenTab={jumpToTab} onOpenManagement={jumpToManagement} />');
    expect(page).toContain('id="os-detail-tabs"');
    expect(page).toContain('id="os-detail-management" tabIndex={-1}');
    expect(page).toContain('section?.focus({ preventScroll: true })');
  });

  it("keeps the existing seven tab panels, permissions and mutation handlers", () => {
    expect((page.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? []).length).toBe(7);
    for (const value of ["summary", "items", "production", "installation", "files", "comments", "history"]) {
      expect(page).toContain(`value="${value}"`);
    }
    expect(page).toContain("getValidOrderTransitions({");
    expect(page).toContain("transitionOrderStatus({");
    expect(page).toContain("hubPermissions.isManager");
    expect(page).toContain("reloadProductionData()");
  });

  it("uses touch-sized targets and a responsive layout without global CSS", () => {
    expect(css).toContain(".evolu-detail__shortcuts-grid");
    expect(css).toContain("min-height: 46px");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain(".dark .evolu-detail__shortcuts");
    expect(css).toContain("#os-detail-management:focus-visible");
  });
});
