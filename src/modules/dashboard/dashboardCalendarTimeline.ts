import type { WorkCalendarVersion } from "./dashboardAdvanced";

export type TimelineResolution =
  | { state: "available"; calendar: WorkCalendarVersion }
  | { state: "unavailable"; calendar: null; reason: string };

/**
 * The original global calendar rows are immutable. A later published version
 * supersedes an earlier one from its effective_from date, regardless of whether
 * that earlier row has an explicit effective_until.
 *
 * Selecting the most recent version BEFORE checking expiry is important:
 * an expired successor must never revive an older superseded version.
 */
export function selectGlobalCalendarForDate(
  versions: readonly WorkCalendarVersion[], date: string,
): TimelineResolution {
  const ms = Date.parse(date + "T12:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    return { state: "unavailable", calendar: null, reason: "Data local inválida." };
  }
  const applicable = versions.filter(row => row.effective_from <= date)
    .sort((a,b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version);
  if (!applicable.length)
    return { state: "unavailable", calendar: null, reason: "Não existe calendário publicado para esta data." };
  if (applicable.length > 1 && applicable[0].effective_from === applicable[1].effective_from)
    return { state: "unavailable", calendar: null, reason: "Existem versões globais conflitantes na mesma data." };
  const winner = applicable[0];
  if (winner.effective_until !== null && date > winner.effective_until)
    return { state: "unavailable", calendar: null, reason: "Há lacuna de vigência no calendário publicado." };
  return { state: "available", calendar: winner };
}

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function effectiveCalendarEnd(
  calendar: WorkCalendarVersion, versions: readonly WorkCalendarVersion[],
): string | null {
  const successors = versions.filter(row => row.effective_from > calendar.effective_from)
    .sort((a,b) => a.effective_from.localeCompare(b.effective_from) || a.version - b.version);
  const successorEnd = successors.length ? previousDate(successors[0].effective_from) : null;
  if (calendar.effective_until === null) return successorEnd;
  if (successorEnd === null) return calendar.effective_until;
  return calendar.effective_until < successorEnd ? calendar.effective_until : successorEnd;
}

export type CalendarSuccessorPreview = {
  state: "valid" | "invalid";
  previousVersion: number | null;
  successorVersion: number;
  effectiveFrom: string;
  previousEffectiveEnd: string | null;
  reason: string;
};

/** Local-only validation and preview. The database RPC remains authoritative. */
export function previewGlobalSuccessor(
  versions: readonly WorkCalendarVersion[], effectiveFrom: string,
): CalendarSuccessorPreview {
  const latest = [...versions].sort((a,b) => b.version - a.version)[0];
  const fallback: CalendarSuccessorPreview = {
    state: "invalid", previousVersion: latest?.version ?? null,
    successorVersion: (latest?.version ?? 0) + 1, effectiveFrom,
    previousEffectiveEnd: null, reason: "",
  };
  const ms = Date.parse(effectiveFrom + "T12:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
      !Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== effectiveFrom)
    return { ...fallback, reason: "Data de vigência inválida." };
  if (latest && effectiveFrom <= latest.effective_from)
    return { ...fallback, reason: "A nova vigência precisa começar após o início da versão mais recente." };
  if (latest?.effective_until && effectiveFrom > nextDate(latest.effective_until)) {
    // The successor can start later, but missing days cannot be inferred as worked.
    return {
      ...fallback,
      reason: "A proposta deixa dias sem calendário vigente. Cadastre uma versão sem lacuna.",
    };
  }
  return {
    state: "valid", previousVersion: latest?.version ?? null,
    successorVersion: (latest?.version ?? 0) + 1, effectiveFrom,
    previousEffectiveEnd: latest ? previousDate(effectiveFrom) : null,
    reason: latest
      ? "A versão anterior será preservada; a nova valerá a partir da data informada."
      : "Primeira versão do calendário geral.",
  };
}
