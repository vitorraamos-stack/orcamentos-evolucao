import { describe, expect, it } from "vitest";
import { buildRetroOverview } from "./dashboardCalendarRetroOverview";
import type { RetroApprovalPreflight } from "./dashboardCalendarRetroApprovalRepository";
import type { RetroServerDayImpact } from "./dashboardCalendarRetroServerImpactRepository";
import type { RetroFullStagePreview } from "./dashboardCalendarRetroFullStageRepository";

const requestId = "request-1";
const preflight = {
  request_id: requestId, candidate_orders: 2, stage_intervals: 2,
  reasons: ["Ainda não comprova cobertura histórica."],
} as unknown as RetroApprovalPreflight;

const daily = {
  request_id: requestId, candidate_orders: 2, candidate_intervals: 2,
  rows: [
    { order_id: "os-1", interval_id: "interval-1", scope: "PRODUCTION",
      state: "verified", useful_minutes_before: 180, useful_minutes_proposed: 60 },
    { order_id: "os-2", interval_id: "interval-2", scope: "ART",
      state: "verified", useful_minutes_before: 60, useful_minutes_proposed: 60 },
  ],
} as unknown as RetroServerDayImpact;

const full = {
  request_id: requestId, candidate_orders: 2, candidate_intervals: 2,
  rows: [
    { order_id: "os-1", interval_id: "interval-1", scope: "PRODUCTION",
      state: "verified", reason: "Evidência validada",
      useful_before: 500, useful_proposed: 380,
      severity_status: "candidate", severity_before: "critical", severity_proposed: "attention" },
    { order_id: "os-2", interval_id: "interval-2", scope: "ART",
      state: "verified", reason: "Evidência validada",
      useful_before: 60, useful_proposed: 60,
      severity_status: "threshold_unverified", severity_before: null, severity_proposed: null },
  ],
} as unknown as RetroFullStagePreview;

describe("resumo gerencial de correções retroativas", () => {
  it("destaca OS afetadas e alertas candidatos sem aprovar a correção", () => {
    const result = buildRetroOverview({ requestId, preflight, day: daily, full });
    expect(result.complete).toBe(true);
    expect(result.affectedOrders).toBe(1);
    expect(result.candidateAlertChanges).toBe(1);
    expect(result.pendingOrders).toBe(0);
    expect(result.orders.map(row => row.id)).toEqual(["os-1", "os-2"]);
    expect(result.orders[0].status).toBe("alert_change");
    expect(result.orders[1].status).toBe("unchanged");
  });

  it("prioriza inconclusões sem inventar alertas para etapas parciais", () => {
    const incomplete = {
      ...full, rows: [
        { ...full.rows[0], state: "insufficient", reason: "Pausas inconclusivas",
          useful_before: null, useful_proposed: null,
          severity_status: "unavailable", severity_before: null, severity_proposed: null },
        full.rows[1],
      ],
    } as RetroFullStagePreview;
    const result = buildRetroOverview({ requestId, preflight, day: daily, full: incomplete });
    expect(result.complete).toBe(true);
    expect(result.pendingOrders).toBe(1);
    expect(result.affectedOrders).toBe(0);
    expect(result.candidateAlertChanges).toBe(0);
    expect(result.orders[0].stages[0].issues.join(" ")).toContain("Pausas inconclusivas");
  });

  it("não permite encaminhamento com consulta faltante ou contagem divergente", () => {
    const missing = buildRetroOverview({ requestId, preflight, day: daily, full: null });
    expect(missing.complete).toBe(false);
    expect(missing.warnings.some(item => item.includes("permanência completa"))).toBe(true);
    const mismatch = buildRetroOverview({ requestId, preflight, day: daily,
      full: { ...full, candidate_intervals: 3 } });
    expect(mismatch.complete).toBe(false);
    expect(mismatch.warnings.some(item => item.includes("quantidades diferentes"))).toBe(true);
  });

  it("detecta etapas divergentes ainda que a contagem seja idêntica", () => {
    const changed = {
      ...full,
      rows: [{ ...full.rows[0], scope: "FINISHING" }, full.rows[1]],
    } as RetroFullStagePreview;
    const result = buildRetroOverview({ requestId, preflight, day: daily, full: changed });
    expect(result.complete).toBe(false);
    expect(result.orders[0].status).toBe("pending");
    expect(result.warnings.some(item => item.includes("diferentes nas consultas"))).toBe(true);
  });
});
