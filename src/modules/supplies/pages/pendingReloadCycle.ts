export async function runPendingReloadCycle(
  fetchOnce: () => Promise<void>,
  prepareAttempt: () => void,
  hasPendingReload: () => boolean
): Promise<unknown> {
  let lastError: unknown = null;

  do {
    prepareAttempt();
    try {
      await fetchOnce();
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  } while (hasPendingReload());

  return lastError;
}
