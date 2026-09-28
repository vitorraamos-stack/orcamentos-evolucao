export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const parts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SAO_PAULO_TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map(part => [part.type, part.value])
  );

export function toSaoPauloDateTimeLocal(iso: string) {
  const p = parts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function saoPauloDateKey(iso: string) {
  return toSaoPauloDateTimeLocal(iso).slice(0, 10);
}

/** Converts a wall-clock value in Sao Paulo without relying on browser timezone. */
export function fromSaoPauloDateTimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Data e hora inválidas.");
  const [, y, m, d, h, min] = match;
  let utc = Date.UTC(+y, +m - 1, +d, +h, +min);
  // Resolve the IANA-zone offset iteratively (also remains correct if Brazil changes DST rules).
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(utc));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    utc += Date.UTC(+y, +m - 1, +d, +h, +min) - represented;
  }
  return new Date(utc).toISOString();
}
