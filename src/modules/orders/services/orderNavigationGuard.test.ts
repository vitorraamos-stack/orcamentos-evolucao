import { describe, expect, it, vi } from "vitest";
import { installOrderDraftNavigationGuard } from "./orderNavigationGuard";

function fixture() {
  let href = "https://example.test/os/order-1";
  let state: unknown = { tab: "items" };
  const target = new EventTarget();
  const dispatch = vi.fn((type: string) => target.dispatchEvent(new Event(type)));
  const history = {
    get state() { return state; },
    pushState(nextState: unknown, _unused: string, nextUrl?: string | URL | null) {
      state = nextState;
      if (nextUrl != null) href = new URL(String(nextUrl), href).href;
      dispatch("pushState");
    },
    replaceState(nextState: unknown, _unused: string, nextUrl?: string | URL | null) {
      state = nextState;
      if (nextUrl != null) href = new URL(String(nextUrl), href).href;
      dispatch("replaceState");
    },
  };
  const browser = {
    history,
    location: { get href() { return href; } },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  } as unknown as Window;

  return {
    browser, dispatch, history, get href() { return href; },
    simulatePop(nextHref: string) {
      href = new URL(nextHref, href).href;
      target.dispatchEvent(new Event("popstate"));
    },
    simulateBeforeUnload() {
      const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
      target.dispatchEvent(event);
      return event;
    },
  };
}

describe("unsaved order draft navigation guard", () => {
  it("blocks internal Wouter pushState and replaceState when cancelled", () => {
    const host = fixture();
    const confirm = vi.fn(() => false);
    const release = installOrderDraftNavigationGuard(host.browser, confirm);
    host.history.pushState({}, "", "/printing");
    host.history.replaceState({}, "", "/os/another");
    expect(host.href).toBe("https://example.test/os/order-1");
    expect(confirm).toHaveBeenCalledTimes(2);
    release();
  });

  it("preserves normal same-page updates and resumes navigation after confirmation", () => {
    const host = fixture();
    const confirm = vi.fn(() => true);
    const original = host.history.pushState;
    const release = installOrderDraftNavigationGuard(host.browser, confirm);
    host.history.pushState({}, "", "/os/order-1#items");
    expect(confirm).not.toHaveBeenCalled();
    host.history.pushState({}, "", "/os/order-2");
    expect(host.href).toBe("https://example.test/os/order-2");
    expect(confirm).toHaveBeenCalledTimes(1);
    release();
    expect(host.history.pushState).toBe(original);
  });

  it("restores OS route after a rejected Back navigation and notifies the router", () => {
    const host = fixture();
    const confirm = vi.fn(() => false);
    const release = installOrderDraftNavigationGuard(host.browser, confirm);
    host.simulatePop("/os");
    expect(host.href).toBe("https://example.test/os/order-1");
    expect(host.dispatch).toHaveBeenCalledWith("pushState");
    release();
  });

  it("allows Back when confirmed and only prompts beforeunload while mounted", () => {
    const host = fixture();
    const confirm = vi.fn(() => true);
    const release = installOrderDraftNavigationGuard(host.browser, confirm);
    expect(host.simulateBeforeUnload().defaultPrevented).toBe(true);
    host.simulatePop("/os");
    expect(host.href).toBe("https://example.test/os");
    expect(host.simulateBeforeUnload().defaultPrevented).toBe(false);
    release();
    expect(host.simulateBeforeUnload().defaultPrevented).toBe(false);
  });
});
