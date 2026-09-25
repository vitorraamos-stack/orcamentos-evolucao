import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
import { transitionOrderStatus } from "./orderStatusService";
describe("transitionOrderStatus", () => {
  it("persists a valid transition through the atomic move RPC", async () => { const move = vi.fn().mockResolvedValue({ data: { id: "order" }, error: null }); await transitionOrderStatus({ orderId: "order", board: "art", from: "Para Aprovação", to: "Produzir", context: { role: "arte_finalista" } }, move); expect(move).toHaveBeenCalledWith(expect.objectContaining({ p_next_art_status: "Produzir", p_next_prod_status: "Produção" })); });
  it("rejects invalid transitions before persistence", async () => { const move = vi.fn(); await expect(transitionOrderStatus({ orderId: "order", board: "art", from: "Caixa de Entrada", to: "Produzir", context: { role: "gerente", isManager: true } }, move)).rejects.toThrow("não permitida"); expect(move).not.toHaveBeenCalled(); });
  it("rejects users without the board role", async () => { await expect(transitionOrderStatus({ orderId: "order", board: "production", from: "Produção", to: "Em Acabamento", context: { role: "arte_finalista" } }, vi.fn())).rejects.toThrow(); });
});
