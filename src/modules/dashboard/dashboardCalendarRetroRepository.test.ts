import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import {
  listCalendarRetroRequests, previewCalendarRetroRequest, requestCalendarRetroReview,
} from "./dashboardCalendarRetroRepository";

function query(rows: unknown[], error: object | null = null) {
  const q = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), then: vi.fn() };
  q.select.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  q.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve({ data: error ? null : rows, error })),
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
