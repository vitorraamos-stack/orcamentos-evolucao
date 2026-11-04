/**
 * Protects in-progress OS drafts against SPA navigation through Wouter's History API.
 *
 * Wouter v3 uses pushState/replaceState and subscribes to their notifications.
 * Restore the original methods when the editor is no longer dirty.
 */
export const ORDER_DRAFT_EXIT_MESSAGE = "Existem alterações não salvas nesta OS. Sair sem salvar?";

export function installOrderDraftNavigationGuard(
  browser: Window,
  confirmLeave = () => browser.confirm(ORDER_DRAFT_EXIT_MESSAGE)
): () => void {
  const { history, location } = browser;
  const stayHref = location.href;
  const stayState = history.state;
  const push = history.pushState;
  const replace = history.replaceState;
  let departureAllowed = false;

  const changesPage = (target?: string | URL | null) => {
    if (target == null) return false;
    try {
      const next = new URL(String(target), location.href);
      const current = new URL(stayHref);
      return next.origin !== current.origin ||
        next.pathname !== current.pathname ||
        next.search !== current.search;
    } catch {
      return true;
    }
  };

  const guardedPush: History["pushState"] = function (data, unused, url) {
    const leaving = changesPage(url);
    if (leaving && !departureAllowed && !confirmLeave()) return;
    const value = push.call(history, data, unused, url);
    if (leaving) departureAllowed = true;
    return value;
  };
  const guardedReplace: History["replaceState"] = function (data, unused, url) {
    const leaving = changesPage(url);
    if (leaving && !departureAllowed && !confirmLeave()) return;
    const value = replace.call(history, data, unused, url);
    if (leaving) departureAllowed = true;
    return value;
  };
  history.pushState = guardedPush;
  history.replaceState = guardedReplace;

  const onPopState = () => {
    if (departureAllowed || !changesPage(location.href)) return;
    if (confirmLeave()) {
      departureAllowed = true;
      return;
    }
    // popstate itself cannot be prevented. Reinstate the current page through
    // Wouter's original pushState wrapper so its subscribers re-read the URL.
    push.call(history, stayState, "", stayHref);
  };
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (departureAllowed) return;
    event.preventDefault();
    event.returnValue = "";
  };
  browser.addEventListener("popstate", onPopState);
  browser.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    browser.removeEventListener("popstate", onPopState);
    browser.removeEventListener("beforeunload", onBeforeUnload);
    if (history.pushState === guardedPush) history.pushState = push;
    if (history.replaceState === guardedReplace) history.replaceState = replace;
  };
}
