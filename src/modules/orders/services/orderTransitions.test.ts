import { describe, expect, it } from "vitest";
import { canTransitionArtStatus, canTransitionProductionStatus, getOrderOperationalStage, getValidOrderTransitions } from "./orderTransitions";

const context = { role: "gerente" as const, isManager: true };
describe("order operational flow", () => {
  it.each([
    ["Caixa de Entrada", null, false, "ENTRY"],
    ["Em Criação", null, false, "ART"],
    ["Para Aprovação", null, false, "APPROVAL"],
    ["Produzir", "Produção", false, "PRODUCTION"],
    ["Produzir", "Em Acabamento", false, "FINISHING"],
    ["Produzir", "Pronto / Avisar Cliente", false, "READY"],
    ["Produzir", "Instalação Agendada", false, "LOGISTICS"],
    ["Produzir", "Finalizados", false, "FINISHED"],
  ])("maps %s / %s to %s", (art, prod, archived, expected) => {
    expect(getOrderOperationalStage({ art_status: art as never, prod_status: prod as never, archived })).toBe(expected);
  });
  it("allows the art feedback loop and blocks jumps", () => {
    expect(canTransitionArtStatus("Para Aprovação", "Ajustes", context)).toBe(true);
    expect(canTransitionArtStatus("Ajustes", "Em Criação", context)).toBe(true);
    expect(canTransitionArtStatus("Caixa de Entrada", "Produzir", context)).toBe(false);
  });
  it("allows production completion and enforces board permission", () => {
    expect(canTransitionProductionStatus("Instalação Agendada", "Finalizados", context)).toBe(true);
    expect(canTransitionProductionStatus("Produção", "Finalizados", context)).toBe(false);
    expect(canTransitionProductionStatus("Produção", "Em Acabamento", { role: "instalador" })).toBe(false);
  });
  it("separates manager and operational permissions", () => {
    expect(canTransitionArtStatus("Em Criação", "Para Aprovação", { role: "arte_finalista" })).toBe(true);
    expect(canTransitionArtStatus("Em Criação", "Para Aprovação", { role: "producao" })).toBe(false);
    expect(canTransitionProductionStatus("Produção", "Em Acabamento", { role: "producao" })).toBe(true);
    expect(canTransitionProductionStatus("Produção", "Em Acabamento", { role: "arte_finalista" })).toBe(false);
    expect(getValidOrderTransitions({ board: "art", from: "Em Criação", role: null })).toEqual([]);
  });
});
