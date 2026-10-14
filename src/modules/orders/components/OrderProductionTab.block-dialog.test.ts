import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canConfirmOperationBlock } from "./OrderProductionTab";

const source = readFileSync(new URL("./OrderProductionTab.tsx", import.meta.url), "utf8");
const block = source.slice(source.indexOf('<Dialog open={Boolean(blocking)}'));

describe("EvoluSystem — safe production operation block dialog", () => {
  it("rejects blank reasons and actions while busy", () => {
    expect(canConfirmOperationBlock("", false)).toBe(false);
    expect(canConfirmOperationBlock("   \n ", false)).toBe(false);
    expect(canConfirmOperationBlock("Aguardando material", true)).toBe(false);
    expect(canConfirmOperationBlock(" Aguardando material ", false)).toBe(true);
  });

  it("identifies the affected operation without extra confirmation panels", () => {
    expect(block).toContain("Setor: {blocking ? WORK_CENTER_LABELS[blocking.work_center]");
    expect(block).toContain("items.find(item => item.id === blocking?.item_id)?.name");
    expect(block).toContain("Bloquear operação");
    expect(block).toContain("Confirmar bloqueio");
    expect(block).toContain('max-h-[90dvh] overflow-y-auto sm:max-w-lg');
  });

  it("links the mandatory reason to its label and guidance", () => {
    expect(block).toContain('htmlFor="os-operation-block-reason"');
    expect(block).toContain('id="os-operation-block-reason"');
    expect(block).toContain('aria-describedby="os-operation-block-help"');
    expect(block).toContain('aria-required="true"');
    expect(block).toContain("maxLength={1000}");
    expect(block).toContain("Informe o impedimento para orientar quem vai retomar a operação.");
  });

  it("guards cancel, modal dismissal and duplicate submissions while busy", () => {
    expect(block).toContain("if (!open && !busy) setBlocking(null)");
    expect(block).toContain('disabled={busy}');
    expect(block).toContain('disabled={!canConfirmOperationBlock(blockedReason, busy)}');
    expect(block).toContain('blocking && canConfirmOperationBlock(blockedReason, busy) && void act(');
    expect(block).toContain('await onStatus(blocking.id, "BLOCKED", blockedReason.trim())');
    expect(block).toContain("setBlocking(null);");
    expect(block).toContain('{busy ? "Bloqueando…" : "Confirmar bloqueio"}');
  });

  it("does not alter the original status transition permissions", () => {
    expect(source).toContain("canOperate &&");
    expect(source).toContain("canManage &&");
    expect(source).toContain('status: "BLOCKED"');
    expect(source).toContain('setBlockedReason(""), setBlocking(operation)');
    expect(source).toContain("onDelete(operation.id)");
  });
});
