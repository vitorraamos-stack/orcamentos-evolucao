export type TimeStampedActivity = { id: string; created_at: string; type: string; payload: Record<string, unknown> };
export type HistoryFilter = "all" | "stages" | "updates";
export const activityCategory = (type: string): Exclude<HistoryFilter, "all"> | "other" => {
  if (["status_change", "status_changed", "returned_to_art"].includes(type)) return "stages";
  if (/^(item_|deadline_|assignee_|details_updated|production_tag_changed|ITEM_OPERATION_)/.test(type)) return "updates";
  return "other";
};
export const dayKey = (utc: string): string | null => {
  const parsed = new Date(utc);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export function filterHistory<T extends TimeStampedActivity>(entries: readonly T[], query: string, filter: HistoryFilter, description: (entry: T) => string): T[] {
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  return entries.filter(entry => {
    if (filter !== "all" && activityCategory(entry.type) !== filter) return false;
    if (!normalized) return true;
    return [description(entry), entry.type, dayKey(entry.created_at)].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalized);
  });
}
export function groupHistoryByDate<T extends TimeStampedActivity>(entries: readonly T[]): { date: string; entries: T[] }[] {
  const groups: { date: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const date = dayKey(entry.created_at) ?? "Data não identificada";
    const last = groups[groups.length - 1];
    if (last?.date === date) last.entries.push(entry);
    else groups.push({ date, entries: [entry] });
  }
  return groups;
}
