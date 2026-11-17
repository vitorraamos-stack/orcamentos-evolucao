import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import { addBusinessDays, filterQueueRows, isOrderDeadlineRisk, isStageOverdue,
  queueMetrics, sortQueueRows, type MyQueueRow } from "./myQueueModel";

const order = {
  id: "o1", sale_number: "1048", client_name: "Cliente", delivery_date: "2026-11-16",
  art_status: "Em Criação", prod_status: null, is_urgent: false, art_direction_tag: null,
} as OsOrder;

function row(id: string, status: MyQueueRow["status"], date: string | null,
  dueKind: MyQueueRow["dueKind"] = "stage"): MyQueueRow {
  return { id, orderId: order.id, order, kind: "ART", sector: "Arte", activity: "Criar arte",
    itemLabel: "Fachada", status, dueDate: date, dueKind, urgent: false, action: "OPEN_OS", updatedAt: "" };
}

describe("Minha Fila de Trabalho", () => {
  it("computes business days without Saturdays and Sundays", () => {
    expect(addBusinessDays("2026-11-13", 3)).toBe("2026-11-18");
  });

  it("does not treat the final OS deadline as an overdue personal-stage SLA", () => {
    const today = "2026-11-17";
    const stage = row("s", "TODO", "2026-11-16");
    const final = row("os", "TODO", "2026-11-16", "order");
    expect(isStageOverdue(stage, today)).toBe(true);
    expect(isStageOverdue(final, today)).toBe(false);
    expect(isOrderDeadlineRisk(final, today)).toBe(true);
    expect(queueMetrics([stage, final], today)).toMatchObject({
      pending: 2, overdue: 1, orderRisk: 1,
    });
  });

  it("does not count waiting or finished activities as executable", () => {
    const today = "2026-11-17";
    const rows = [row("w", "WAITING", "2026-11-16"), row("d", "DONE", "2026-11-15")];
    expect(queueMetrics(rows, today)).toMatchObject({ pending: 0, overdue: 0, waiting: 1 });
    expect(filterQueueRows(rows, { view: "action", search: "", sector: "all", period: "all", today })).toEqual([]);
    expect(filterQueueRows(rows, { view: "waiting", search: "", sector: "all", period: "all", today }).map(x => x.id)).toEqual(["w"]);
  });

  it("sorts actionable overdue activities before other deadlines", () => {
    const result = sortQueueRows([
      row("later", "TODO", "2026-11-23"),
      row("now", "TODO", "2026-11-17"),
      row("late", "IN_PROGRESS", "2026-11-16"),
    ], "2026-11-17");
    expect(result.map(x => x.id)).toEqual(["late", "now", "later"]);
  });

  it("matches words without accents and filters by sector", () => {
    const rows = [row("a", "TODO", null)];
    expect(filterQueueRows(rows, { view: "action", search: "criacao", sector: "all",
      period: "all", today: "2026-11-17" })).toEqual([]);
    expect(filterQueueRows(rows, { view: "action", search: "fachada", sector: "Arte",
      period: "all", today: "2026-11-17" })).toHaveLength(1);
    expect(filterQueueRows(rows, { view: "action", search: "", sector: "Produção",
      period: "all", today: "2026-11-17" })).toEqual([]);
  });
});
