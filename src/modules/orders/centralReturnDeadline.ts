/**
 * Ends a location attempt even when the underlying network request fails
 * to observe AbortSignal. Its late resolution/rejection is ignored by the
 * raced promise; abort remains best-effort resource cleanup.
 */
export async function boundedCentralLookup<T>(
  request: (signal: AbortSignal) => Promise<T>,
  controller: AbortController,
  limitMs: number
): Promise<{ status: "found"; value: T } | { status: "timeout" }> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ status: "timeout" }>(resolve => {
    timeoutId = setTimeout(() => {
      // Resolve first: an AbortError should not win the deadline race.
      resolve({ status: "timeout" });
      controller.abort();
    }, limitMs);
  });
  try {
    const lookup = Promise.resolve()
      .then(() => request(controller.signal))
      .then(value => ({ status: "found" as const, value }));
    return await Promise.race([lookup, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
