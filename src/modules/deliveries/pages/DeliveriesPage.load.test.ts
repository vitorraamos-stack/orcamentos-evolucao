import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { requestDeliveryWorkspaceLoad } from "./DeliveriesPage";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(fetchWorkspaceOnce: () => Promise<void>) {
  const activeLoadPromiseRef = { current: null as Promise<void> | null };
  const reloadPendingRef = { current: false };
  const loadingRef = { current: false };
  const onFinalError = vi.fn();
  const states: boolean[] = [];
  const load = () =>
    requestDeliveryWorkspaceLoad({
      activeLoadPromiseRef,
      reloadPendingRef,
      loadingRef,
      fetchWorkspaceOnce,
      onStart: () => states.push(true),
      onFinalError,
      onFinish: () => states.push(false),
    });
  return {
    activeLoadPromiseRef,
    reloadPendingRef,
    loadingRef,
    load,
    onFinalError,
    states,
  };
}

describe("fila de refresh da Central de Entregas", () => {
  it("não mantém snapshot antigo quando um reload chega durante o fetch", async () => {
    const first = deferred<void>();
    let snapshot = "";
    const fetchWorkspaceOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        await first.promise;
        snapshot = "antigo";
      })
      .mockImplementationOnce(async () => {
        snapshot = "novo";
      });
    const queue = setup(fetchWorkspaceOnce);

    const cycle = queue.load();
    const joinedCycle = queue.load();
    expect(joinedCycle).toBe(cycle);
    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(1);

    first.resolve();
    await cycle;

    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(2);
    expect(snapshot).toBe("novo");
    expect(queue.states).toEqual([true, false]);
    expect(queue.loadingRef.current).toBe(false);
  });

  it("consolida múltiplos pedidos durante o mesmo fetch", async () => {
    const first = deferred<void>();
    const fetchWorkspaceOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce();
    const queue = setup(fetchWorkspaceOnce);

    const cycle = queue.load();
    queue.load();
    queue.load();
    queue.load();
    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(1);
    expect(queue.loadingRef.current).toBe(true);

    first.resolve();
    await cycle;
    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(2);
  });

  it("executa um terceiro fetch quando há refresh durante o segundo", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const fetchWorkspaceOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValueOnce();
    const queue = setup(fetchWorkspaceOnce);

    const cycle = queue.load();
    queue.load();
    first.resolve();
    await vi.waitFor(() => expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(2));

    queue.load();
    second.resolve();
    await cycle;
    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(3);
  });

  it("recupera de erro quando existe reload pendente", async () => {
    const first = deferred<void>();
    const fetchWorkspaceOnce = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce();
    const queue = setup(fetchWorkspaceOnce);

    const cycle = queue.load();
    queue.load();
    first.reject(new Error("snapshot falhou"));
    await cycle;

    expect(fetchWorkspaceOnce).toHaveBeenCalledTimes(2);
    expect(queue.onFinalError).not.toHaveBeenCalled();
  });

  it("reporta somente o erro do fetch final", async () => {
    const error = new Error("falha final");
    const queue = setup(vi.fn().mockRejectedValue(error));

    await queue.load();

    expect(queue.onFinalError).toHaveBeenCalledOnce();
    expect(queue.onFinalError).toHaveBeenCalledWith(error);
    expect(queue.activeLoadPromiseRef.current).toBeNull();
    expect(queue.states).toEqual([true, false]);
  });
});
