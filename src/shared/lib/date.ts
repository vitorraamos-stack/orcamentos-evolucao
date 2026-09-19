export const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";

type LocalDateParts = { year: number; month: number; day: number };

function localDateParts(date: Date): LocalDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Formats a Date as the calendar day used by the Brazilian operation. */
export function formatLocalDate(date: Date) {
  const { year, month, day } = localDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns the instant corresponding to midnight in America/Sao_Paulo. */
export function startOfLocalDay(date: Date) {
  const { year, month, day } = localDateParts(date);
  // Brazil currently uses UTC-03. Noon avoids DST/midnight parsing ambiguity;
  // the second pass derives the actual offset for the requested calendar day.
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: OPERATIONAL_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(noonUtc)
  );
  const offsetHours = localHour - 12;
  return new Date(Date.UTC(year, month - 1, day, -offsetHours));
}

/** Adds calendar days in the operational timezone, rather than UTC hours. */
export function addLocalDays(date: Date, days: number) {
  const { year, month, day } = localDateParts(date);
  const target = new Date(Date.UTC(year, month - 1, day + days, 15));
  return startOfLocalDay(target);
}

export function localDateRange(start: Date, days: number) {
  return {
    start: formatLocalDate(start),
    end: formatLocalDate(addLocalDays(start, days)),
  };
}
