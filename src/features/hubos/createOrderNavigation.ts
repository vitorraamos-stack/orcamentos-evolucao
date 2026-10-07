export const DEFAULT_ORDER_CREATION_RETURN_PATH = "/os";

/** Resolve a return destination without allowing protocol-relative or external URLs. */
export function resolveOrderCreationReturnPath(
  value: string | null | undefined
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_ORDER_CREATION_RETURN_PATH;
  }

  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") {
      return DEFAULT_ORDER_CREATION_RETURN_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_ORDER_CREATION_RETURN_PATH;
  }
}

export function createOrderPath(returnTo: string): string {
  const safeReturnTo = resolveOrderCreationReturnPath(returnTo);
  return `/os/novo?returnTo=${encodeURIComponent(safeReturnTo)}`;
}


export function createOrderFromQuotePath(
  quoteId: string,
  returnTo: string
): string {
  const safeReturnTo = resolveOrderCreationReturnPath(returnTo);
  const params = new URLSearchParams({
    returnTo: safeReturnTo,
    quote: quoteId,
  });
  return `/os/novo?${params.toString()}`;
}
