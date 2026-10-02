import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./AwaitingSuppliesPage.tsx", import.meta.url),
  "utf8"
);

describe("AwaitingSuppliesPage operational inbox", () => {
  it("keeps the header and renders one concise empty state before operational controls", () => {
    expect(source).toContain("Aguardando Insumos");
    expect(source).toContain("Nenhuma OS aguardando insumos");
    expect(source).toContain(
      "A Produção não possui pendências de material neste momento."
    );
    expect(source).toContain("orders.length === 0 ? (");
  });

  it("provides semantic summary cards and counted filters backed by one state", () => {
    expect(source).toContain("function SummaryCards");
    expect(source).toContain("aria-pressed={filter === card.value}");
    expect(source).toContain('label: "Aguardando"');
    expect(source).toContain('label: "Críticas"');
    expect(source).toContain('label: "Urgentes"');
    expect(source).toContain('label: "Vencidas"');
    expect(source).toContain("summary[option.key]");
  });

  it("supports local search, all four sorting modes and empty-filter recovery", () => {
    expect(source).toContain(
      'placeholder="Buscar por OS, cliente ou material..."'
    );
    expect(source).toContain('<option value="priority">Prioridade</option>');
    expect(source).toContain('<option value="oldest">Mais antigas</option>');
    expect(source).toContain('<option value="newest">Mais recentes</option>');
    expect(source).toContain('<option value="deadline">Prazo</option>');
    expect(source).toContain("Limpar busca e filtros");
  });

  it("reconciles selection exclusively against visible orders and resets dialog context", () => {
    expect(source).toContain("const selectedIdRef = useRef");
    expect(source).toContain("const selectOrder = useCallback");
    expect(source).toContain("reconcileAwaitingSupplySelection");
    expect(source).toContain(
      "const selected = visible.find(order => order.id === selectedId) ?? null;"
    );
    expect(source).toContain("setDialogOpen(false);");
    expect(source).toContain('setNotes("");');
  });

  it("shows an action-oriented detail and a canonical-data-only timeline", () => {
    expect(source).toContain("MATERIAL NECESSÁRIO");
    expect(source).toContain("O que precisa ser feito");
    expect(source).toContain("function SupplyTimeline");
    expect(source).toContain("Material solicitado");
    expect(source).toContain("Resolução anterior");
    expect(source).not.toContain("insumos_requested_by");
  });

  it("preserves permission, validation and the canonical RESOLVE operation", () => {
    expect(source).toContain("hubPermissions.canMoveProducaoBoard");
    expect(source).toContain(
      'await updateOrderInsumos(orderId, "RESOLVE", resolutionNotes)'
    );
    expect(source).toContain("notes.trim().length < 3");
    expect(source).toContain("Marcar insumo como resolvido");
    expect(source).toContain("Confirmar e retornar para Produção");
  });

  it("locks context controls during resolution and guards concurrent loads", () => {
    expect(source).toContain("const loadingRef = useRef(false)");
    expect(source).toContain("if (loadingRef.current) return;");
    expect(source).toContain("disabled={busy}");
    expect(source).toContain("disabled={loading || busy}");
  });
});
