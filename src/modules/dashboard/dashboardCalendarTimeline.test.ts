import { describe, expect, it } from "vitest";
import type { WorkCalendarVersion } from "./dashboardAdvanced";
import {
  effectiveCalendarEnd, previewGlobalSuccessor, selectGlobalCalendarForDate,
} from "./dashboardCalendarTimeline";

const version = (
  version: number, from: string, until: string | null = null,
): WorkCalendarVersion => ({
  id: "global-" + version, version, time_zone: "America/Sao_Paulo",
  effective_from: from, effective_until: until,
});

describe("Dashboard Etapa 1 — sucessão imutável do calendário geral", () => {
  it("aplica versão posterior sem alterar a versão histórica aberta", () => {
    const old = version(1, "2026-11-01");
    const next = version(2, "2026-11-10");
    const rows = [next, old]; // read order does not matter
    expect(selectGlobalCalendarForDate(rows, "2026-11-09")).toMatchObject({
      state: "available", calendar: { id: "global-1" },
    });
    expect(selectGlobalCalendarForDate(rows, "2026-11-10")).toMatchObject({
      state: "available", calendar: { id: "global-2" },
    });
    expect(effectiveCalendarEnd(old, rows)).toBe("2026-11-09");
    expect(old.effective_until).toBeNull();
  });

  it("não ressuscita versão antiga quando sucessora expirou", () => {
    const rows = [version(1,"2026-10-01"),version(2,"2026-11-10","2026-11-13")];
    expect(selectGlobalCalendarForDate(rows, "2026-11-13").state).toBe("available");
    expect(selectGlobalCalendarForDate(rows, "2026-11-14")).toMatchObject({
      state: "unavailable", calendar: null,
    });
  });

  it("identifica lacuna e impede datas conflitantes e inválidas", () => {
    const rows = [version(1,"2026-11-01","2026-11-04"),version(2,"2026-11-09")];
    expect(selectGlobalCalendarForDate(rows,"2026-11-06").state).toBe("unavailable");
    expect(selectGlobalCalendarForDate([version(1,"2026-11-01"),version(2,"2026-11-01")],"2026-11-03")
      .state).toBe("unavailable");
    expect(selectGlobalCalendarForDate(rows,"2026-02-30").state).toBe("unavailable");
    expect(selectGlobalCalendarForDate(rows,"2026-13-01").state).toBe("unavailable");
  });

  it("prévia exige datas futuras à versão mais recente e sem lacuna", () => {
    const prev = version(1,"2026-11-01");
    expect(previewGlobalSuccessor([prev],"2026-11-10")).toMatchObject({
      state: "valid", previousVersion: 1, successorVersion: 2, previousEffectiveEnd: "2026-11-09",
    });
    expect(previewGlobalSuccessor([prev],"2026-10-31").state).toBe("invalid");
    expect(previewGlobalSuccessor([version(1,"2026-11-01","2026-11-05")],
      "2026-11-07").state).toBe("invalid");
    expect(previewGlobalSuccessor([version(1,"2026-11-01","2026-11-05")],
      "2026-11-06").state).toBe("valid");
    expect(previewGlobalSuccessor([],"2026-11-09")).toMatchObject({
      state:"valid",successorVersion:1,
    });
  });
});
