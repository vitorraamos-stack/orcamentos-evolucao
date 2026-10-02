export const reconcilePendingSelection = (
  currentKey: string | null,
  availableKeys: readonly string[]
) =>
  currentKey !== null && availableKeys.includes(currentKey)
    ? currentKey
    : (availableKeys[0] ?? null);
