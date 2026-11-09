import type { OperationalScope, WeeklyWindow, WorkWindow } from "./dashboardOperationalPolicy";

/**
 * Versioned sector-specific variations on the global published calendar.
 * Each revision is a complete immutable snapshot. Newer effective_from replaces
 * older versions from that date forward WITHOUT rewriting previous versions.
 */
export type SectorCalendarException = {
  date: string;
  windows: WorkWindow[]; // [] means authorized closure; split shifts are supported
  reason: string;
};

export type SectorCalendarRevision = {
  id: string;
  scope: OperationalScope;
  base_calendar_version_id: string;
  revision: number;
  effective_from: string;
  effective_until: string | null;
  mode: "inherit" | "override";
  periods: WeeklyWindow[];
  exceptions: SectorCalendarException[];
  published_at: string;
  published_by: string;
  reason: string;
};

export type SectorCalendarDraft = {
  scope: OperationalScope;
  baseCalendarVersionId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  mode: "inherit" | "override";
  periods: WeeklyWindow[];
  exceptions: SectorCalendarException[];
};

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateWindows(windows: readonly WorkWindow[]): string | null {
  const sorted = [...windows].sort((a,b) => a.start.localeCompare(b.start));
  let lastEnd = "";
  for (const row of sorted) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) ||
        row.start >= row.end) return "Horário inválido: use HH:MM e início anterior ao fim.";
    if (row.start < lastEnd) return "Existem intervalos sobrepostos.";
    lastEnd = row.end;
  }
  return null;
}

export function validateSectorCalendarDraft(draft: SectorCalendarDraft): string | null {
  if (!draft.baseCalendarVersionId) return "Selecione um calendário padrão publicado.";
  if (!isCalendarDate(draft.effectiveFrom)) return "Informe uma data inicial válida.";
  if (draft.effectiveUntil && (!isCalendarDate(draft.effectiveUntil) || draft.effectiveUntil < draft.effectiveFrom))
    return "Fim de vigência inválido.";
  if (draft.mode === "inherit" && draft.periods.length)
    return "Jornada herdada não pode possuir turnos setoriais próprios.";
  if (draft.mode === "override" && (!draft.periods.length || draft.periods.length > 28))
    return "Jornada própria requer entre 1 e 28 turnos.";
  if (draft.mode !== "inherit" && draft.mode !== "override") return "Modo de calendário inválido.";
  for (let day = 0; day < 7; day++) {
    const values = draft.periods.filter(p => p.weekday === day);
    const error = validateWindows(values);
    if (error) return "Dia " + day + ": " + error;
  }
  if (draft.periods.some(p => !Number.isInteger(p.weekday) || p.weekday < 0 || p.weekday > 6))
    return "Dia da semana inválido.";
  if (draft.exceptions.length > 3660) return "Há exceções demais.";
  const dates = new Set<string>();
  for (const exception of draft.exceptions) {
    if (!isCalendarDate(exception.date) || exception.date < draft.effectiveFrom ||
        (draft.effectiveUntil !== null && exception.date > draft.effectiveUntil))
      return "Exceção fora da vigência ou data inválida.";
    if (dates.has(exception.date)) return "Mais de uma exceção para a mesma data.";
    if (!exception.reason.trim() || exception.reason.length > 500)
      return "Exceção sem justificativa válida.";
    if (exception.windows.length > 6) return "Cada exceção aceita no máximo seis turnos.";
    const error = validateWindows(exception.windows);
    if (error) return "Exceção " + exception.date + ": " + error;
    dates.add(exception.date);
  }
  return null;
}

export function selectSectorCalendarRevision(
  rows: readonly SectorCalendarRevision[], scope: OperationalScope,
  baseCalendarId: string, date: string,
): SectorCalendarRevision | null {
  if (!isCalendarDate(date)) return null;
  const eligible = rows.filter(row =>
    row.scope === scope && row.base_calendar_version_id === baseCalendarId &&
    row.effective_from <= date && (row.effective_until === null || date <= row.effective_until)
  );
  // Most recently effective revision wins. Same-date ties are prohibited by SQL.
  return eligible.sort((a,b) =>
    b.effective_from.localeCompare(a.effective_from) || b.revision - a.revision
  )[0] ?? null;
}

export type ResolvedSectorDay =
  | { state: "available"; windows: WorkWindow[]; source:
      "base" | "base_exception" | "sector_week" | "sector_exception"; revision: number | null; reason: string }
  | { state: "insufficient"; windows: []; source: "unavailable"; revision: null; reason: string };

/** A sector's weekly hours never silently override a legal holiday in the base calendar. */
export function resolveSectorCalendarDay(input: {
  date: string;
  scope: OperationalScope;
  baseCalendarId: string;
  baseWeek: readonly WeeklyWindow[];
  baseException?: { windows: readonly WorkWindow[]; reason: string } | null;
  sectorRevisions: readonly SectorCalendarRevision[];
}): ResolvedSectorDay {
  if (!isCalendarDate(input.date)) return {
    state: "insufficient", windows: [], source: "unavailable", revision: null, reason: "Data inválida.",
  };
  const revision = selectSectorCalendarRevision(
    input.sectorRevisions, input.scope, input.baseCalendarId, input.date
  );
  const exception = revision?.exceptions.find(row => row.date === input.date);
  const weekday = new Date(input.date + "T12:00:00Z").getUTCDay();
  let source: "base" | "base_exception" | "sector_week" | "sector_exception";
  let windows: WorkWindow[];
  let reason = "";
  if (exception) {
    source = "sector_exception"; windows = exception.windows;
    reason = exception.reason;
  } else if (input.baseException) {
    source = "base_exception"; windows = [...input.baseException.windows];
    reason = input.baseException.reason;
  } else if (revision?.mode === "override") {
    source = "sector_week";
    windows = revision.periods.filter(row => row.weekday === weekday)
      .map(row => ({ start: row.start, end: row.end }));
    reason = "Jornada específica do setor";
  } else {
    source = "base";
    windows = input.baseWeek.filter(row => row.weekday === weekday)
      .map(row => ({ start: row.start, end: row.end }));
    reason = "Jornada padrão compartilhada";
  }
  const error = validateWindows(windows);
  if (error) return {
    state: "insufficient", windows: [], source: "unavailable", revision: null,
    reason: error,
  };
  return {
    state: "available", windows: [...windows].sort((a,b) => a.start.localeCompare(b.start)),
    source, revision: revision?.revision ?? null, reason,
  };
}
