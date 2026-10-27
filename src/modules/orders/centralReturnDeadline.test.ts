import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedCentralLookup } from "./centralReturnDeadline";

afterEach(() => vi.useRealTimers());

describe("bounded Central location and late-response protection", () => {
  it("returns the original result without abort when the query finishes in time", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    expect(await boundedCentralLookup(async () => "page 3", controller, 5000))
      .toEqual({ status: "found", value: "page 3" });
    expect(controller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles at the deadline even if the query ignores AbortSignal", async () => {
    vi.useFakeTimers();
    let completeLate!: (value: string) => void;
    const slow = new Promise<string>(resolve => { completeLate = resolve; });
    const controller = new AbortController();
    const pending = boundedCentralLookup(() => slow, controller, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: "timeout" });
    expect(controller.signal.aborted).toBe(true);
    completeLate("page 99");
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates genuine errors before the deadline instead of hiding them", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    await expect(boundedCentralLookup(async () => {
      throw new Error("Network unavailable");
    }, controller, 5000)).rejects.toThrow("Network unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });
});
