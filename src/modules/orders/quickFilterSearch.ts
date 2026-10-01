import type { QuickOrderFilter } from "./orderFilters";

const validQuickFilters = new Set<QuickOrderFilter>([
  "all",
  "active",
  "today",
  "tomorrow",
  "week",
  "overdue",
  "urgent",
  "pending",
  "finished",
]);

export function parseQuickFilterFromSearch(search: string): QuickOrderFilter {
  const value = new URLSearchParams(search).get("quick");
  return validQuickFilters.has(value as QuickOrderFilter)
    ? (value as QuickOrderFilter)
    : "all";
}
