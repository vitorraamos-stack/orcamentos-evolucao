import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./OrdersCentralPage.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../components/OrderTable.tsx", import.meta.url), "utf8");

describe("Central de OS — EvoluSystem Premium", () => {
  it("keeps quick filters accessible without opening the advanced popover", () => {
    expect(page).toContain('aria-label="Filtros rápidos"');
    expect(page).toContain("quickFilters.map(([value, label]) => (");
    expect(page).toContain("aria-pressed={quick === value}");
    expect(page).toContain("setQuick(value)");
    expect(page).toContain("setPage(1)");
  });

  it("does not change query, draft filters, role protection or pagination", () => {
    expect(page).toContain("listOperationalOrders({");
    expect(page).toContain("listOperationalOrderSummaryRows()");
    expect(page).toContain("summarizeOrders(");
    expect(page).toContain('setQuery(search)');
    expect(page).toContain("}, 350)");
    expect(page).toContain('onOpenChange={handleFiltersOpenChange}');
    expect(page).toContain('onClick={applyDraftFilters}');
    expect(page).toContain("hubPermissions.canCreateOs &&");
    expect(page).toContain('setLocation(createOrderPath("/os"))');
    expect(page).toContain('Mostrando {orders.length} de {total} ordens');
  });

  it("renders a mobile-specific OS card and retains the desktop table", () => {
    expect(table).toContain('aria-label="Lista de ordens de serviço"');
    expect(table).toContain('className="evolu-orders__mobile-list lg:hidden"');
    expect(table).toContain('className="evolu-orders__desktop-table hidden overflow-x-auto');
    expect(table).toContain("aria-label={" + "`" + "Visualizar OS " + "${number}" + "`" + "}");
    expect(table).toContain("OrderRiskBadge risk={risk}");
    expect(table).toContain("OrderStatusBadge status={order.prod_status || order.art_status}");
    expect(table).toContain("OrderPriorityBadge urgent={isOrderUrgent(order)}");
    expect(table).toContain("min-w-[1040px]");
  });
});
