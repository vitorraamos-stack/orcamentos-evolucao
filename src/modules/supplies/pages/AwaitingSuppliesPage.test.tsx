import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runPendingReloadCycle } from "./pendingReloadCycle";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  it("locks context controls and queues concurrent loads on the active promise", () => {
    expect(source).toContain("const loadingRef = useRef(false)");
    expect(source).toContain("const reloadPendingRef = useRef(false)");
    expect(source).toContain(
      "const activeLoadPromiseRef = useRef<Promise<void> | null>(null)"
    );
    expect(source).toContain("reloadPendingRef.current = true;");
    expect(source).toContain(
      "return activeLoadPromiseRef.current ?? Promise.resolve();"
    );
    expect(source).toContain("activeLoadPromiseRef.current = null;");
    expect(source).toContain("disabled={busy}");
    expect(source).toContain("disabled={loading || busy}");
    expect(source).toContain("disabled={interactionLocked}");
  });
});

describe("AwaitingSuppliesPage serialized reload cycle", () => {
  it("replaces an old refresh snapshot with one post-resolution fetch", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    let pending = false;
    let activeFetches = 0;
    let maximumActiveFetches = 0;
    let renderedOrders = ["OS A"];
    const fetchOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        activeFetches += 1;
        maximumActiveFetches = Math.max(maximumActiveFetches, activeFetches);
        await first.promise;
        renderedOrders = ["OS A"];
        activeFetches -= 1;
      })
      .mockImplementationOnce(async () => {
        activeFetches += 1;
        maximumActiveFetches = Math.max(maximumActiveFetches, activeFetches);
        await second.promise;
        renderedOrders = [];
        activeFetches -= 1;
      });

    const cycle = runPendingReloadCycle(
      fetchOnce,
      () => {
        pending = false;
      },
      () => pending
    );

    pending = true;
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.waitFor(() => expect(fetchOnce).toHaveBeenCalledTimes(2));
    expect(renderedOrders).toEqual(["OS A"]);

    second.resolve();
    await cycle;

    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(maximumActiveFetches).toBe(1);
    expect(renderedOrders).toEqual([]);
  });

  it("consolidates multiple requests during a fetch but retries again during the next fetch", async () => {
    const attempts = [deferred<void>(), deferred<void>(), deferred<void>()];
    let pending = false;
    const fetchOnce = vi.fn(async () => {
      await attempts[fetchOnce.mock.calls.length - 1].promise;
    });
    const cycle = runPendingReloadCycle(
      fetchOnce,
      () => {
        pending = false;
      },
      () => pending
    );

    pending = true;
    pending = true;
    attempts[0].resolve();
    await vi.waitFor(() => expect(fetchOnce).toHaveBeenCalledTimes(2));

    pending = true;
    attempts[1].resolve();
    await vi.waitFor(() => expect(fetchOnce).toHaveBeenCalledTimes(3));
    attempts[2].resolve();
    await cycle;

    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it("discards an earlier error when the pending latest read succeeds", async () => {
    let pending = true;
    const fetchOnce = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("snapshot failed"))
      .mockResolvedValueOnce(undefined);

    const lastError = await runPendingReloadCycle(
      fetchOnce,
      () => {
        const wasPending = pending;
        pending = false;
        if (fetchOnce.mock.calls.length === 0) pending = wasPending;
      },
      () => pending
    );

    expect(fetchOnce).toHaveBeenCalledTimes(2);
    expect(lastError).toBeNull();
  });

  it("returns only the final error when no newer reload is pending", async () => {
    const failure = new Error("final failure");
    const fetchOnce = vi.fn().mockRejectedValue(failure);

    const lastError = await runPendingReloadCycle(
      fetchOnce,
      () => undefined,
      () => false
    );

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(lastError).toBe(failure);
  });
});
