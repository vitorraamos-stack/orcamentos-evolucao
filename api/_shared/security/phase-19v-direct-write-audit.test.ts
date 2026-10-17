import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

const detail = read("src/modules/hub-os/pages/OsDetailPage.tsx");
const api = read("src/modules/hub-os/api.ts");
const kanban = read("src/modules/hub-os/pages/OsKanbanPage.tsx");
const production = read("src/modules/hub-os/pages/OsProducaoBoardPage.tsx");
const arte = read("src/modules/hub-os/pages/OsArteBoardPage.tsx");
const proposal = read("docs/tasks/phase-19v-atomic-finalization-PROPOSAL.sql");
const audit = read("docs/tasks/phase-19v-direct-write-security-audit.md");

describe("19V: documented security audit, static and non-mutating", () => {
  it("captures the existing non-atomic status/event submission", () => {
    const start = detail.indexOf("const handlePaymentSubmit = async () => {");
    const stop = detail.indexOf("\n  if (loading) {", start);
    const handler = detail.slice(start, stop);
    expect(start).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(start);
    expect(handler.indexOf("payment_status: nextStatus"))
      .toBeLessThan(handler.indexOf('type: "PAYMENT_SUBMITTED"'));
    expect(handler).toContain("createOsEvent({");
    expect(handler).toContain("updateOs(order.id, {");
    expect(api).toContain("export const updateOsPaymentStatus = async (");
    expect(api).toContain('from("os_event")');
  });

  it("separates finance writes from unrelated production/arte board changes", () => {
    for (const page of [kanban, production, arte]) {
      expect(page).toContain("updateOs(");
      expect(page).not.toMatch(/payment_status\s*:/);
      expect(page).not.toContain("PAYMENT_SUBMITTED");
    }
    expect(kanban).toContain("status_id:");
    expect(production).toContain("status_producao:");
    expect(arte).toContain("status_arte:");
  });

  it("does not misrepresent the additive RPC as global write enforcement", () => {
    expect(audit).toContain("19V-A, preparação aditiva");
    expect(audit).toContain("19V-B, migração do consumidor");
    expect(audit).toContain("19V-C, enforcement depois da adoção");
    expect(audit).toContain("os_event_delete");
    expect(audit).toContain("os_event_insert");
    expect(audit).toContain("os_update");
    expect(audit).toContain("GRANT de UPDATE em nível de tabela");
    expect(proposal).toContain("NOT A COMPLETE SECURITY MIGRATION");
    expect(proposal).toContain("SECURITY INVOKER");
    expect(proposal).toContain("19V_FINANCIAL_VALUES_INVALID");
    expect(proposal).toContain("current_os_payment_status");
  });

  it("keeps any executable migration outside the audit PR", () => {
    expect(proposal).toContain("REVIEW ONLY, NOT A MIGRATION");
    expect(audit).toContain("não são arquivos de migration");
    expect(proposal).toContain("DO NOT EXECUTE");
  });
});
