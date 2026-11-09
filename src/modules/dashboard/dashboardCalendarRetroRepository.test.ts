import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import {
  listCalendarRetroRequests, previewCalendarRetroRequest, requestCalendarRetroReview,
} from "./dashboardCalendarRetroRepository";

function query(rows: unknown[], error: object | null = null, total = rows.length) {
  const q = { select: vi.fn(), order: vi.fn(), range: vi.fn(), then: vi.fn() };
  q.select.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.range.mockReturnValue(q);
  q.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve({ data: error ? null : rows, error, count: total })),
  );
  return q;
}

describe("Dashboard — solicitações retroativas conservadoras", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não interpreta migration ausente como histórico vazio", async () => {
    mocks.from.mockReturnValue(query([], { code: "PGRST205", message: "missing" }));
    await expect(listCalendarRetroRequests()).resolves.toEqual({
      state: "unavailable", rows: [],
    });
  });

  it("erro de permissão é exibido em vez de ocultado", async () => {
    mocks.from.mockReturnValue(query([], { code: "42501", message: "Sem autorização" }));
    await expect(listCalendarRetroRequests()).rejects.toThrow("Sem autorização");
  });

  it("consulta todas as páginas e nunca corta o histórico em 100 registros", async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({ id: "id-" + (1000-i) }));
    const second = Array.from({ length: 2 }, (_, i) => ({ id: "id-" + (500-i) }));
    const firstQuery = query(first, null, 502);
    const secondQuery = query(second, null, 502);
    mocks.from.mockReturnValueOnce(firstQuery).mockReturnValueOnce(secondQuery);
    const result = await listCalendarRetroRequests();
    expect(result.state).toBe("available");
    expect(result.rows).toHaveLength(502);
    expect(firstQuery.range).toHaveBeenCalledWith(0, 499);
    expect(secondQuery.range).toHaveBeenCalledWith(500, 999);
  });

  it("rejeita histórico truncado ou modificado durante paginação", async () => {
    mocks.from.mockReturnValueOnce(query([{id:"1"}], null, 2));
    await expect(listCalendarRetroRequests()).rejects.toThrow("Histórico incompleto");
    mocks.from.mockReset();
    mocks.from.mockReturnValueOnce(query(Array.from({length:500},(_,i)=>({id:String(i)})), null, 501))
      .mockReturnValueOnce(query([{id:"501"}], null, 502));
    await expect(listCalendarRetroRequests()).rejects.toThrow("histórico mudou");
  });

  it("prévia não publica nem altera períodos e solicita apenas a data selecionada", async () => {
    const result = {
      calendar_version_id: "calendar-1", exception_date: "2026-11-04",
      existing_exception: null, stage_intervals_candidates: 4,
      verified_stage_intervals_candidates: 1, duration_impact_verified: false,
      observacao: "Prévia consultiva",
    };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    await expect(previewCalendarRetroRequest({
      calendarVersionId: "calendar-1", date: "2026-11-04",
    })).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_preview_calendar_retro_request", {
      p_calendar_version_id: "calendar-1", p_date: "2026-11-04",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("solicitação registra motivo e turno sem aplicar a correção", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id:"request-1", state:"pending_review" }, error: null,
    });
    await expect(requestCalendarRetroReview({
      calendarVersionId:"calendar-1",date:"2026-11-04",
      working:true,start:"09:00",end:"12:00",reason:"Plantão realizado e confirmado",
    })).resolves.toMatchObject({ state:"pending_review" });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_request_calendar_retro_review", {
      p_calendar_version_id:"calendar-1",p_date:"2026-11-04",
      p_working:true,p_start:"09:00",p_end:"12:00",
      p_reason:"Plantão realizado e confirmado",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
