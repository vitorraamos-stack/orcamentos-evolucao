import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import {
  loadSectorCalendarRevisions, publishSectorCalendar,
} from "./dashboardSectorCalendarRepository";

function query(rows: unknown[], failure: object | null = null, count: number | null = rows.length) {
  const q = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
  q.select.mockReturnValue(q); q.order.mockReturnValue(q);
  q.range.mockImplementation(async (start: number, end: number) => ({
    data: failure ? null : rows.slice(start,end+1), count, error: failure,
  }));
  return q;
}

describe("Dashboard Etapa 1 — repositório de calendário setorial", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não afirma ausência de regras quando a tabela ainda não existe", async () => {
    mocks.from.mockReturnValue(query([], { code: "PGRST205", message: "Missing table" }));
    expect(await loadSectorCalendarRevisions()).toEqual({ state: "unavailable", revisions: [] });
  });
  it("falhas de acesso não são escondidas como calendário vazio", async () => {
    mocks.from.mockReturnValue(query([], { code: "42501", message: "Sem permissão" }));
    await expect(loadSectorCalendarRevisions()).rejects.toThrow("Sem permissão");
  });
  it("um resultado de páginas incompletas nunca é considerado válido", async () => {
    mocks.from.mockReturnValue(query([], null, 1));
    await expect(loadSectorCalendarRevisions()).rejects.toThrow("incompletos");
    mocks.from.mockReturnValue(query([], null, null));
    await expect(loadSectorCalendarRevisions()).rejects.toThrow("Contagem");
  });
  it("consulta todas as revisões com contagem exata e ordenação estável", async () => {
    const rows = [{ id: "r1", scope: "PRODUCTION", revision: 1 }];
    const q = query(rows);
    mocks.from.mockReturnValue(q);
    await expect(loadSectorCalendarRevisions()).resolves.toEqual({
      state: "available", revisions: rows,
    });
    expect(mocks.from).toHaveBeenCalledWith("dashboard_sector_calendar_revisions");
    expect(q.select).toHaveBeenCalledWith(expect.stringContaining("effective_from"),{count:"exact"});
    expect(q.order).toHaveBeenCalledWith("id",{ascending:true});
    expect(q.range).toHaveBeenCalledWith(0,499);
  });
  it("publica por RPC autenticada com revisão e justificativa, sem escrita direta", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "r2", revision: 2 }, error: null });
    const draft = {
      scope: "PRODUCTION" as const, baseCalendarVersionId: "base-1",
      effectiveFrom: "2026-11-10", effectiveUntil: null,
      mode: "inherit" as const, periods: [],
      exceptions: [{ date: "2026-11-10",windows:[],reason:"Paralisação aprovada" }],
      expectedRevision: 1, reason: "Alteração autorizada",
    };
    await expect(publishSectorCalendar(draft)).resolves.toMatchObject({ revision: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_publish_sector_calendar",{
      p_scope: "PRODUCTION", p_base_calendar_version_id: "base-1",
      p_effective_from: "2026-11-10", p_effective_until: null,
      p_mode: "inherit", p_periods: [], p_exceptions: draft.exceptions,
      p_expected_revision: 1, p_reason: "Alteração autorizada",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
