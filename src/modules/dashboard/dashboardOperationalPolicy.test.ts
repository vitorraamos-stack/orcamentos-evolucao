import { describe, expect, it } from "vitest";
import {
  assessOperationalThreshold, previewCalendarDay, proposedEvolucaoWorkweek,
  verifiedSaoJose2026Observances, type CalendarPreviewInput,
} from "./dashboardOperationalPolicy";

const base = (): CalendarPreviewInput => ({
  date: "2026-11-09", scope: "PRODUCTION",
  baseWeek: proposedEvolucaoWorkweek(),
  holidays: verifiedSaoJose2026Observances(),
});

describe("Dashboard Etapa 1 — jornada, exceções e feriados", () => {
  it("preserva a jornada de 44 horas com retorno às 13h12, sem publicação implícita", () => {
    const schedule = proposedEvolucaoWorkweek();
    expect(schedule).toHaveLength(10);
    expect(schedule.every(row => row.weekday >= 1 && row.weekday <= 5)).toBe(true);
    expect(previewCalendarDay(base())).toMatchObject({ state: "available", origin: "base", windows: [
      { start: "08:00", end: "12:00" }, { start: "13:12", end: "18:00" },
    ] });
    expect(previewCalendarDay({ ...base(), date: "2026-11-07" })).toMatchObject({ windows: [] });
  });

  it("reconhece feriados nacionais, municipais e Data Magna estadual transferida", () => {
    const observed = verifiedSaoJose2026Observances();
    expect(observed.filter(row => row.kind === "holiday" && row.jurisdiction === "national")).toHaveLength(10);
    expect(observed.some(row => row.date === "2026-03-19" && row.jurisdiction === "municipal")).toBe(true);
    expect(observed.some(row => row.date === "2026-06-04" && row.jurisdiction === "municipal")).toBe(true);
    expect(observed.some(row => row.date === "2026-08-16" && row.jurisdiction === "state")).toBe(true);
    expect(previewCalendarDay({ ...base(), date: "2026-11-20" })).toMatchObject({ origin: "holiday", windows: [] });
    expect(previewCalendarDay({ ...base(), date: "2026-03-19" })).toMatchObject({ origin: "holiday", windows: [] });
  });

  it("não desconta Carnaval/pontos facultativos automaticamente", () => {
    const result = previewCalendarDay({ ...base(), date: "2026-02-17" });
    expect(result).toMatchObject({ state: "available", origin: "base", windows: [
      { start: "08:00", end: "12:00" }, { start: "13:12", end: "18:00" },
    ] });
  });

  it("permite reabrir feriado apenas com exceção autorizada e documentada", () => {
    const result = previewCalendarDay({ ...base(), date: "2026-11-20", exceptions: [{
      date: "2026-11-20", scope: null, windows: [{ start: "09:00", end: "12:00" }],
      approvedBy: "gestor-1", reason: "Plantão extraordinário autorizado",
    }] });
    expect(result).toMatchObject({ origin: "company_exception", windows: [{ start: "09:00", end: "12:00" }] });
  });

  it("faz a exceção do setor prevalecer sobre a geral, sem afetar outro setor", () => {
    const exceptions = [
      { date: "2026-11-09", scope: null, windows: [], approvedBy: "gestor-1", reason: "Paralisação da empresa" },
      { date: "2026-11-09", scope: "INSTALLATION" as const, windows: [{ start: "08:00", end: "11:00" }],
        approvedBy: "gestor-1", reason: "Instalação autorizada" },
    ];
    expect(previewCalendarDay({ ...base(), scope: "INSTALLATION", exceptions })).toMatchObject({
      origin: "sector_exception", windows: [{ start: "08:00", end: "11:00" }],
    });
    expect(previewCalendarDay({ ...base(), scope: "PRODUCTION", exceptions })).toMatchObject({
      origin: "company_exception", windows: [],
    });
  });

  it("não contabiliza exceções sem autorização nem horários contraditórios", () => {
    const result = previewCalendarDay({ ...base(), exceptions: [{
      date: "2026-11-09", scope: null, windows: [], approvedBy: "", reason: "Sem autorização",
    }] });
    expect(result.state).toBe("insufficient");
    const conflict = previewCalendarDay({ ...base(), baseWeek: [
      { weekday: 1, start: "08:00", end: "12:00" },
      { weekday: 1, start: "11:00", end: "13:00" },
    ] });
    expect(conflict.state).toBe("insufficient");
  });
});

describe("Dashboard Etapa 1 — limites de Atenção e Crítico", () => {
  const limits = { attentionMinutes: 120, criticalMinutes: 240 };
  it("exige dois limites válidos e evidência de permanência total", () => {
    expect(assessOperationalThreshold(null, limits)).toMatchObject({ state: "unavailable", severity: null });
    expect(assessOperationalThreshold(140, { attentionMinutes: 120, criticalMinutes: null })).toMatchObject({
      state: "unconfigured", severity: null,
    });
    expect(assessOperationalThreshold(140, { attentionMinutes: 240, criticalMinutes: 120 })).toMatchObject({
      state: "unavailable", severity: null,
    });
  });
  it("classifica em normal, Atenção e Crítico sem inventar causa de atraso", () => {
    expect(assessOperationalThreshold(119, limits)).toMatchObject({ severity: "normal" });
    expect(assessOperationalThreshold(120, limits)).toMatchObject({ severity: "attention" });
    expect(assessOperationalThreshold(239, limits)).toMatchObject({ severity: "attention" });
    expect(assessOperationalThreshold(240, limits)).toMatchObject({ severity: "critical" });
    expect(assessOperationalThreshold(240, limits).reason).toContain("causa não foi presumida");
  });
});
