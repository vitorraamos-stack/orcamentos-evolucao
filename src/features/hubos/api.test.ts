import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc,
    from,
    auth: {
      getUser,
    },
  },
}));

describe("src/features/hubos/api secure mutation contracts", () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
    from.mockReset();
  });

  it("archiveOrder usa contrato server-side", async () => {
    const { archiveOrder } = await import("./api");
    rpc.mockResolvedValueOnce({
      data: { id: "os-1", archived: true },
      error: null,
    });

    await archiveOrder("os-1", "Gerente");

    expect(rpc).toHaveBeenCalledWith("hub_os_archive_order_secure", {
      p_os_id: "os-1",
      p_reason: "manual_archive",
      p_payload: { actor_name: "Gerente" },
    });
  });

  it("updateOrder manager usa RPC atômica com evento embutido", async () => {
    const { updateOrder } = await import("./api");

    getUser.mockResolvedValueOnce({
      data: { user: { id: "u-1" } },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error("unexpected table");
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { role: "gerente" }, error: null }),
          }),
        }),
      };
    });

    rpc.mockResolvedValueOnce({ data: { id: "os-2" }, error: null });

    await updateOrder("os-2", { title: "Nova descrição" });

    expect(rpc).toHaveBeenCalledWith("hub_os_update_order_secure", {
      p_os_id: "os-2",
      p_patch: { title: "Nova descrição" },
      p_event_type: null,
      p_event_payload: null,
    });
  });

  it("moveOrder usa exclusivamente a RPC de transição", async () => {
    const { moveOrder } = await import("./api");
    rpc.mockResolvedValueOnce({ data: { id: "os-3" }, error: null });

    await moveOrder("os-3", "art", "Produzir", { from: "valor-do-cliente" });

    expect(rpc).toHaveBeenCalledWith("hub_os_move_order_secure", {
      p_os_id: "os-3",
      p_next_art_status: "Produzir",
      p_next_prod_status: "Produção",
      p_event_payload: { from: "valor-do-cliente" },
    });
  });

  it("sendOrderToProduction envia prazo como parâmetros operacionais", async () => {
    const { sendOrderToProduction } = await import("./api");
    rpc.mockResolvedValueOnce({ data: { id: "os-4" }, error: null });
    await sendOrderToProduction({
      orderId: "os-4",
      deadlineStartedAt: "2026-09-25T13:00:00.000Z",
      deliveryDate: "2026-10-05",
      eventPayload: { source: "dialog" },
    });
    expect(rpc).toHaveBeenCalledWith("hub_os_send_to_production_secure", {
      p_os_id: "os-4",
      p_delivery_deadline_started_at: "2026-09-25T13:00:00.000Z",
      p_delivery_date: "2026-10-05",
      p_event_payload: { source: "dialog" },
    });
  });

  it("returnOrderToArt usa o contrato administrativo dedicado", async () => {
    const { returnOrderToArt } = await import("./api");
    rpc.mockResolvedValueOnce({ data: { id: "os-5" }, error: null });
    await returnOrderToArt("os-5", "Correção solicitada");
    expect(rpc).toHaveBeenCalledWith("hub_os_return_order_to_art_secure", {
      p_os_id: "os-5",
      p_reason: "Correção solicitada",
      p_event_payload: {},
    });
  });

  it("setProductionTag usa o contrato operacional dedicado", async () => {
    const { setProductionTag } = await import("./api");
    rpc.mockResolvedValueOnce({ data: { id: "os-6" }, error: null });
    await setProductionTag("os-6", "AGUARDANDO_INSUMOS", "Chapa ACM");
    expect(rpc).toHaveBeenCalledWith("hub_os_set_production_tag_secure", {
      p_os_id: "os-6",
      p_production_tag: "AGUARDANDO_INSUMOS",
      p_insumos_details: "Chapa ACM",
    });
  });

  it("updateOrderInsumos usa ação operacional estreita", async () => {
    const { updateOrderInsumos } = await import("./api");
    rpc.mockResolvedValueOnce({ data: { id: "os-7" }, error: null });
    await updateOrderInsumos("os-7", "RESOLVE", "Material entregue");
    expect(rpc).toHaveBeenCalledWith("hub_os_update_insumos_secure", {
      p_os_id: "os-7",
      p_action: "RESOLVE",
      p_notes: "Material entregue",
    });
  });
});
