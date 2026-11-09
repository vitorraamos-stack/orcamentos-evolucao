/**
 * Etapa 1 (Decisões 01–08 e 38–39): núcleo puro para prévia de calendários
 * e classificação de permanência. NÃO publica calendário/regra no Supabase.
 * Nenhuma data fora do conjunto verificado recebe feriado presumido.
 */
export type OperationalScope =
  | "ART" | "APPROVAL" | "PRODUCTION" | "FINISHING" | "INSTALLATION" | "LOGISTICS";

export type WorkWindow = { start: string; end: string };
export type WeeklyWindow = WorkWindow & { weekday: number };
export type LegalHoliday = {
  date: string;
  name: string;
  jurisdiction: "national" | "state" | "municipal";
  kind: "holiday" | "optional_leave";
  source: string;
};
export type AuthorizedCalendarException = {
  date: string;
  scope: OperationalScope | null;
  windows: WorkWindow[];
  reason: string;
  approvedBy: string;
};
export type CalendarPreviewInput = {
  date: string;
  scope: OperationalScope;
  baseWeek: readonly WeeklyWindow[];
  sectorWeeks?: Partial<Record<OperationalScope, readonly WeeklyWindow[]>>;
  holidays: readonly LegalHoliday[];
  exceptions?: readonly AuthorizedCalendarException[];
};
export type CalendarPreviewResult =
  | { state: "available"; windows: WorkWindow[]; origin: "base" | "sector" | "holiday" | "company_exception" | "sector_exception"; reason: string }
  | { state: "insufficient"; windows: []; origin: "unavailable"; reason: string };

const MUNICIPAL_2026 = "https://saojose.sc.gov.br/sao-jose-define-calendario-de-feriados-e-pontos-facultativos-para-2026/95037/";
const SC_2026 = "https://leis.alesc.sc.gov.br/ato-normativo/53811";
const FEDERAL_2026 = "https://agenciagov.ebc.com.br/noticias/202512/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026";

/**
 * Recorte verificado EXCLUSIVAMENTE para o ano civil de 2026.
 * São José: Decreto 23.649/2025; SC: Decreto 1.374/2026.
 * Data Magna SC de 11/08 foi transferida para o domingo 16/08/2026.
 * Pontos facultativos são meramente informativos e NÃO fecham o expediente.
 * Para outros anos, o chamador deve validar nova fonte oficial.
 */
export function verifiedSaoJose2026Observances(): LegalHoliday[] {
  const national: Array<[string, string]> = [
    ["01-01", "Confraternização Universal"],
    ["04-03", "Paixão de Cristo"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalhador"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const municipal: Array<[string, string]> = [
    ["03-19", "Aniversário de São José"],
    ["06-04", "Corpus Christi (São José)"],
  ];
  const optional: Array<[string, string]> = [
    ["01-02", "Ponto facultativo municipal"],
    ["02-16", "Carnaval"],
    ["02-17", "Carnaval"],
    ["02-18", "Quarta-feira de Cinzas (expediente público parcial)"],
    ["10-28", "Dia do Servidor Público (ponto facultativo)"],
    ["12-24", "Véspera de Natal"],
    ["12-31", "Véspera de Ano-Novo"],
  ];
  return [
    ...national.map(([day, name]): LegalHoliday => ({
      date: "2026-" + day, name, jurisdiction: "national", kind: "holiday", source: FEDERAL_2026,
    })),
    ...municipal.map(([day, name]): LegalHoliday => ({
      date: "2026-" + day, name, jurisdiction: "municipal", kind: "holiday", source: MUNICIPAL_2026,
    })),
    {
      date: "2026-08-16", name: "Data Magna de Santa Catarina (transferida)",
      jurisdiction: "state", kind: "holiday", source: SC_2026,
    },
    ...optional.map(([day, name]): LegalHoliday => ({
      date: "2026-" + day, name, jurisdiction: "municipal", kind: "optional_leave", source: MUNICIPAL_2026,
    })),
  ];
}

/** Jornada aprovada — usada apenas como proposta de configuração, nunca publicada automaticamente. */
export function proposedEvolucaoWorkweek(): WeeklyWindow[] {
  return [1, 2, 3, 4, 5].flatMap(weekday => [
    { weekday, start: "08:00", end: "12:00" },
    { weekday, start: "13:12", end: "18:00" },
  ]);
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const instant = new Date(date + "T12:00:00Z");
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === date;
}

function validWindows(windows: readonly WorkWindow[]): boolean {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  let previousEnd = "";
  for (const window of sorted) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) ||
        window.start >= window.end || window.start < previousEnd) return false;
    previousEnd = window.end;
  }
  return true;
}

function insufficient(reason: string): CalendarPreviewResult {
  return { state: "insufficient", origin: "unavailable", reason, windows: [] };
}

/** Precedência: exceção setorial > exceção geral > feriado legal > semana setorial > semana geral. */
export function previewCalendarDay(input: CalendarPreviewInput): CalendarPreviewResult {
  if (!validDate(input.date)) return insufficient("Data inválida.");
  const weekday = new Date(input.date + "T12:00:00Z").getUTCDay();
  const sectorWeek = input.sectorWeeks?.[input.scope];
  if (!input.baseWeek.every(row => Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday <= 6) ||
      (sectorWeek && !sectorWeek.every(row => Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday <= 6)))
    return insufficient("O calendário contém dias da semana inválidos.");
  if (!validWindows(input.baseWeek.filter(row => row.weekday === weekday)) ||
      (sectorWeek && !validWindows(sectorWeek.filter(row => row.weekday === weekday))))
    return insufficient("O calendário contém intervalos inválidos ou sobrepostos.");
  const exceptions = (input.exceptions ?? []).filter(row => row.date === input.date);
  const unauthorized = exceptions.find(row => !row.approvedBy.trim() || !row.reason.trim() || !validWindows(row.windows));
  if (unauthorized) return insufficient("Uma exceção não possui autorização, justificativa ou horários verificáveis.");
  const sectorExceptions = exceptions.filter(row => row.scope === input.scope);
  const companyExceptions = exceptions.filter(row => row.scope === null);
  if (sectorExceptions.length > 1 || companyExceptions.length > 1)
    return insufficient("Existem exceções conflitantes na mesma data e abrangência.");
  const chosen = sectorExceptions[0] ?? companyExceptions[0];
  if (chosen) return {
    state: "available", windows: [...chosen.windows].sort((a, b) => a.start.localeCompare(b.start)),
    origin: chosen.scope === null ? "company_exception" : "sector_exception", reason: chosen.reason,
  };
  const holiday = input.holidays.find(row => row.date === input.date && row.kind === "holiday");
  if (holiday) {
    if (!holiday.source.trim()) return insufficient("Feriado sem fonte verificável.");
    return { state: "available", windows: [], origin: "holiday", reason: holiday.name };
  }
  const selected = sectorWeek ?? input.baseWeek;
  return {
    state: "available", windows: selected.filter(row => row.weekday === weekday)
      .map(row => ({ start: row.start, end: row.end })).sort((a, b) => a.start.localeCompare(b.start)),
    origin: sectorWeek ? "sector" : "base", reason: sectorWeek ? "Jornada setorial aprovada" : "Jornada padrão aprovada",
  };
}

export type AlertThresholds = { attentionMinutes: number | null; criticalMinutes: number | null };
export type AlertAssessment =
  | { state: "available"; severity: "normal" | "attention" | "critical"; reason: string }
  | { state: "unavailable" | "unconfigured"; severity: null; reason: string };

/** Exige os dois limites e permanência TOTAL verificada; nenhuma criticidade é presumida. */
export function assessOperationalThreshold(
  totalUsefulMinutes: number | null, thresholds: AlertThresholds,
): AlertAssessment {
  if (totalUsefulMinutes === null || !Number.isSafeInteger(totalUsefulMinutes) || totalUsefulMinutes < 0)
    return { state: "unavailable", severity: null, reason: "Permanência total ainda não verificada." };
  const { attentionMinutes, criticalMinutes } = thresholds;
  if (attentionMinutes === null || criticalMinutes === null)
    return { state: "unconfigured", severity: null, reason: "Os limites Atenção e Crítico ainda não foram publicados." };
  if (!Number.isSafeInteger(attentionMinutes) || !Number.isSafeInteger(criticalMinutes) ||
      attentionMinutes <= 0 || criticalMinutes <= attentionMinutes)
    return { state: "unavailable", severity: null, reason: "Limites inválidos: Crítico deve ser superior a Atenção." };
  if (totalUsefulMinutes >= criticalMinutes)
    return { state: "available", severity: "critical", reason: "Permanência total atingiu o limite Crítico; a causa não foi presumida." };
  if (totalUsefulMinutes >= attentionMinutes)
    return { state: "available", severity: "attention", reason: "Permanência total atingiu o limite Atenção; a causa não foi presumida." };
  return { state: "available", severity: "normal", reason: "Permanência total dentro dos limites publicados." };
}
