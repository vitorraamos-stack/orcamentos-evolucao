import type { QuickOrderFilter } from "./orderFilters";

const STORAGE_KEY = "evolusystem:orders-central:return-v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const allowedQuick: readonly QuickOrderFilter[] = [
  "all", "active", "overdue", "finished",
  "today", "tomorrow", "week", "urgent", "pending",
];

export type CentralReturnContext = {
  userId: string;
  orderId: string;
  page: number;
  search: string;
  quick: QuickOrderFilter;
  artStatus: string;
  prodStatus: string;
  priority: string;
  logistics: string;
  openedAt: number;
  phase: "opening" | "detail";
};

const getStorage = (storage: Storage | null) => {
  try { return storage?.getItem(STORAGE_KEY) ?? null; } catch { return null; }
};

export function clearCentralReturn(storage: Storage | null) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

function isValid(value: unknown): value is CentralReturnContext {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CentralReturnContext>;
  return typeof entry.userId === "string" && entry.userId.length > 0 &&
    typeof entry.orderId === "string" && entry.orderId.length > 0 &&
    Number.isSafeInteger(entry.page) && (entry.page ?? 0) >= 1 &&
    typeof entry.search === "string" && entry.search.length <= 1000 &&
    allowedQuick.includes(entry.quick as QuickOrderFilter) &&
    ["artStatus", "prodStatus", "priority", "logistics"].every(
      key => typeof entry[key as keyof CentralReturnContext] === "string"
    ) &&
    typeof entry.openedAt === "number" &&
    (entry.phase === "opening" || entry.phase === "detail");
}

function readStored(storage: Storage | null, now: number): CentralReturnContext | null {
  const saved = getStorage(storage);
  if (!saved) return null;
  try {
    const value: unknown = JSON.parse(saved);
    if (!isValid(value) || now < value.openedAt ||
        now - value.openedAt > MAX_AGE_MS) {
      clearCentralReturn(storage);
      return null;
    }
    return value;
  } catch {
    clearCentralReturn(storage);
    return null;
  }
}

export function saveCentralReturn(
  storage: Storage | null,
  context: Omit<CentralReturnContext, "phase" | "openedAt">,
  now: number
) {
  const value: CentralReturnContext = {
    ...context, openedAt: now, phase: "opening",
  };
  if (!isValid(value)) return;
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* ignored */ }
}

/** A direct external detail link must not fabricate a Central return. */
export function markCentralDetailEntered(
  storage: Storage | null,
  userId: string,
  orderId: string,
  now: number
) {
  const value = readStored(storage, now);
  if (!value) return;
  if (value.userId !== userId || value.orderId !== orderId) {
    clearCentralReturn(storage);
    return;
  }
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...value, phase: "detail" }));
  } catch { /* unavailable */ }
}

/**
 * Do not restore a return over an explicit URL quick filter that differs.
 * Search and the other detailed filters never appear in the URL.
 */
export function readCentralReturn(
  storage: Storage | null,
  userId: string | null | undefined,
  search: string,
  now: number
): CentralReturnContext | null {
  const value = readStored(storage, now);
  if (!value) return null;
  if (!userId || value.userId !== userId || value.phase !== "detail") return null;
  const params = new URLSearchParams(search);
  const explicitQuick = params.get("quick");
  if (explicitQuick !== null && explicitQuick !== value.quick) return null;
  return value;
}

export function consumeCentralReturn(
  storage: Storage | null,
  value: CentralReturnContext
) {
  const current = readStored(storage, Date.now());
  if (current?.userId === value.userId &&
      current?.orderId === value.orderId &&
      current.openedAt === value.openedAt &&
      current.phase === "detail") clearCentralReturn(storage);
}

/** Modified/middle-click opens a separate tab and must not share the origin. */
export function isSameTabOrderActivation(
  event: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">
): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey &&
    !event.shiftKey && !event.altKey;
}
