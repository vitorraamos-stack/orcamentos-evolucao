import { describe, expect, it } from "vitest";
import {
  resolveSectorCalendarDay, selectSectorCalendarRevision, validateSectorCalendarDraft,
  type SectorCalendarRevision,
} from "./dashboardSectorCalendar";
import { proposedEvolucaoWorkweek } from "./dashboardOperationalPolicy";

const base: SectorCalendarRevision = {
  id: "r1", scope: "PRODUCTION", base_calendar_version_id: "base-1",
  revision: 1, effective_from: "2026-11-01", effective_until: null,
  mode: "override", periods: [
    { weekday: 1, start: "09:00", end: "12:00" },
    { weekday: 1, start: "13:00", end: "17:00" },
  ], exceptions: [], published_at: "2026-11-01T00:00:00Z",
  published_by: "gestor", reason: "Jornada setorial autorizada",
};
const args = (date = "2026-11-09", revisions: SectorCalendarRevision[] = [base]) => ({
  date, scope: "PRODUCTION" as const, baseCalendarId: "base-1",
  baseWeek: proposedEvolucaoWorkweek(), sectorRevisions: revisions,
});

describe("Dashboard calendários setoriais — resolução e vigência", () => {
  it("herda a jornada padrão na ausência de configuração setorial", () => {
    expect(resolveSectorCalendarDay(args("2026-11-09", []))).toMatchObject({
      source: "base", windows: [
        { start: "08:00", end: "12:00" },
        { start: "13:12", end: "18:00" },
      ],
    });
  });

  it("usa jornada própria apenas em dias contemplados, sem afetar outros setores", () => {
    expect(resolveSectorCalendarDay(args())).toMatchObject({
      source: "sector_week", revision: 1, windows: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    });
    const installation = resolveSectorCalendarDay({ ...args(), scope: "INSTALLATION" });
    expect(installation.source).toBe("base");
  });

  it("prioriza feriado ou exceção do calendário padrão sobre jornada semanal setorial", () => {
    const day = resolveSectorCalendarDay({
      ...args(), baseException: { windows: [], reason: "Finados transferido não inferido" },
    });
    expect(day).toMatchObject({ source: "base_exception", windows: [], revision: 1 });
  });

  it("exceção autorizada do setor pode abrir turno especial em feriado e ter dois turnos", () => {
    const overrides = [{ ...base, exceptions: [{
      date: "2026-11-09", reason: "Plantão do setor", windows: [
        { start: "08:30", end: "11:00" }, { start: "13:00", end: "14:30" },
      ],
    }] }];
    const day = resolveSectorCalendarDay({
      ...args("2026-11-09", overrides),
      baseException: { windows: [], reason: "Feriado" },
    });
    expect(day).toMatchObject({
      source: "sector_exception", windows: [
        { start: "08:30", end: "11:00" }, { start: "13:00", end: "14:30" },
      ],
    });
  });

  it("nova revisão substitui futura sem reescrever datas anteriores", () => {
    const revisions: SectorCalendarRevision[] = [
      base, { ...base, id: "r2", revision: 2, effective_from: "2026-11-10",
        mode: "inherit", periods: [] },
    ];
    expect(selectSectorCalendarRevision(revisions, "PRODUCTION", "base-1", "2026-11-09")?.revision).toBe(1);
    expect(selectSectorCalendarRevision(revisions, "PRODUCTION", "base-1", "2026-11-10")?.revision).toBe(2);
    expect(resolveSectorCalendarDay(args("2026-11-09", revisions)).source).toBe("sector_week");
    expect(resolveSectorCalendarDay(args("2026-11-10", revisions)).source).toBe("base");
  });

  it("não reativa revisão antiga depois do fim de uma versão mais recente", () => {
    const revisions: SectorCalendarRevision[] = [
      base, {
        ...base, id: "r2", revision: 2, effective_from: "2026-11-10",
        effective_until: "2026-11-13", mode: "inherit", periods: [],
      },
    ];
    expect(selectSectorCalendarRevision(revisions, "PRODUCTION", "base-1", "2026-11-13")?.revision).toBe(2);
    expect(selectSectorCalendarRevision(revisions, "PRODUCTION", "base-1", "2026-11-14")).toBeNull();
    expect(resolveSectorCalendarDay(args("2026-11-14", revisions)).source).toBe("base");
  });

  it("valida datas, intervalos sobrepostos, duplicidade de exceção e vigência", () => {
    const draft = {
      scope: "PRODUCTION" as const, baseCalendarVersionId: "base-1",
      effectiveFrom: "2026-11-09", effectiveUntil: null,
      mode: "override" as const, periods: [
        { weekday: 1, start: "08:00", end: "12:00" },
        { weekday: 1, start: "11:00", end: "15:00" },
      ], exceptions: [],
    };
    expect(validateSectorCalendarDraft(draft)).toContain("sobrepostos");
    const corrected = { ...draft, mode: "inherit" as const, periods: [], exceptions: [
      { date: "2026-11-10", reason: "Recesso", windows: [] },
      { date: "2026-11-10", reason: "Plantão", windows: [] },
    ] };
    expect(validateSectorCalendarDraft(corrected)).toContain("Mais de uma exceção");
    expect(validateSectorCalendarDraft({
      ...corrected, exceptions: [{ date: "2026-10-01", reason: "Fora", windows: [] }],
    })).toContain("vigência");
  });
});
