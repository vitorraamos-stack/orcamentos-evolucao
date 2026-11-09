import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import {
  loadPublishedThresholds, previewThresholds, publishThresholds,
} from "./dashboardThresholdsRepository";

function query(data: unknown[], error: object | null = null) {
  const chain = {
    select: vi.fn(), order: vi.fn(), limit: vi.fn(),
    then: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve({ data, error })),
  );
  return chain;
}

describe("Dashboard novas regras — limite e auditoria via API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trata schema ainda não migrado como indisponível, não como zero", async () => {
    mocks.from.mockReturnValue(query([], { code: "PGRST205", message: "Could not find the table" }));
    await expect(loadPublishedThresholds()).resolves.toEqual({ state: "unavailable", rows: [] });
  });

  it("não oculta erro de permissão como ausência de limites", async () => {
    mocks.from.mockReturnValue(query([], { code: "42501", message: "Permission denied" }));
    await expect(loadPublishedThresholds()).rejects.toThrow("Permission denied");
  });

  it("consulta limites por SELECT com contrato estrito", async () => {
    const rows = [{
      scope: "PRODUCTION", attention_limit_minutes: 120, critical_limit_minutes: 240,
      calendar_version_id: "c1", revision: 1, effective_from: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z", updated_by: "manager-1",
    }];
    mocks.from.mockReturnValue(query(rows));
    await expect(loadPublishedThresholds()).resolves.toEqual({ state: "available", rows });
    expect(mocks.from).toHaveBeenCalledWith("dashboard_operational_thresholds");
  });

  it("faz prévia somente com parâmetros explicitamente fornecidos", async () => {
    const result = { scope: "PRODUCTION", os_consultadas: 8, intervalos_candidatos: 0,
      impacto_verificado: false, observacao: "Prévia informativa" };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    await expect(previewThresholds({
      scope: "PRODUCTION", attentionMinutes: 120, criticalMinutes: 240, calendarVersionId: "c1",
    })).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_preview_thresholds", {
      p_scope: "PRODUCTION", p_attention_minutes: 120, p_critical_minutes: 240,
      p_calendar_version_id: "c1",
    });
  });

  it("publica apenas por RPC gerencial com revisão esperada e justificativa", async () => {
    mocks.rpc.mockResolvedValue({ data: { scope: "PRODUCTION", revision: 2 }, error: null });
    await publishThresholds({
      scope: "PRODUCTION", attentionMinutes: 120, criticalMinutes: 240,
      calendarVersionId: "c1", expectedRevision: 1, reason: "Limites revisados",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_publish_thresholds", {
      p_scope: "PRODUCTION", p_attention_minutes: 120, p_critical_minutes: 240,
      p_calendar_version_id: "c1", p_expected_revision: 1, p_reason: "Limites revisados",
    });
  });
});
