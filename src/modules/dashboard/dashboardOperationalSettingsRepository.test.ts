import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  previewDashboardRuleImpact, publishDashboardCalendar, publishDashboardRule,
} from "./dashboardOperationalSettingsRepository";

describe("Dashboard Etapa 4 — RPCs administrativas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("previews only the selected scope and explicit rule values", async () => {
    const preview = {
      scope: "PRODUCTION", os_consultadas: 8, sem_responsavel: 2,
      sem_prazo: 1, duracao_verificada: false, observacao: "Prévia do instante atual",
    };
    mocks.rpc.mockResolvedValue({ data: preview, error: null });
    await expect(previewDashboardRuleImpact({
      scope: "PRODUCTION", owner: "required", deadline: "conditional",
      conditionLogisticType: "instalacao", stalledLimitMinutes: 240,
      calendarVersionId: "calendar-1",
    })).resolves.toEqual(preview);
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_preview_rule_impact", {
      p_scope: "PRODUCTION", p_owner: "required", p_deadline: "conditional",
      p_condition_logistic_type: "instalacao", p_stalled_limit_minutes: 240,
      p_calendar_version_id: "calendar-1",
    });
  });

  it("publishes a rule with optimistic revision and an audit reason", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: "rule-1", scope: "ART", revision: 1 }, error: null,
    });
    await publishDashboardRule({
      scope: "ART", owner: "optional", deadline: "required",
      conditionLogisticType: null, stalledLimitMinutes: null,
      calendarVersionId: null, expectedRevision: 0, reason: "Prazo de arte definido",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_publish_rule", {
      p_scope: "ART", p_owner: "optional", p_deadline: "required",
      p_condition_logistic_type: null, p_stalled_limit_minutes: null,
      p_calendar_version_id: null, p_expected_revision: 0,
      p_reason: "Prazo de arte definido",
    });
  });

  it("publishes only user-entered calendar periods and exceptions", async () => {
    mocks.rpc.mockResolvedValue({
      data: { id: "calendar-1", version: 1, status: "published" }, error: null,
    });
    const periods = [{ weekday: 1, start: "08:00", end: "12:00" }];
    const exceptions = [{ date: "2026-12-25", working: false, start: null, end: null, reason: "Feriado" }];
    await publishDashboardCalendar({
      name: "Jornada informada", effectiveFrom: "2026-11-10",
      effectiveUntil: "2026-12-31", periods, exceptions,
      expectedLastVersion: 0, reason: "Configuração aprovada pela gestão",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_publish_calendar", {
      p_name: "Jornada informada", p_effective_from: "2026-11-10",
      p_effective_until: "2026-12-31", p_periods: periods,
      p_exceptions: exceptions, p_expected_last_version: 0,
      p_reason: "Configuração aprovada pela gestão",
    });
  });

  it("surfaces server validation errors without retrying direct table writes", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Calendário não publicado" } });
    await expect(previewDashboardRuleImpact({
      scope: "PRODUCTION", owner: "optional", deadline: "optional",
      conditionLogisticType: null, stalledLimitMinutes: 120, calendarVersionId: null,
    })).rejects.toThrow("Calendário não publicado");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
