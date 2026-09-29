import { describe, expect, it } from "vitest";
import { resolveDesignerSlaDeadline } from "./designerSla";
const date = (
  art_direction_tag: "CRIACAO_ARTE" | "ARTE_PRONTA_EDICAO" | "URGENTE",
  is_urgent: boolean
) =>
  resolveDesignerSlaDeadline({
    art_direction_tag,
    is_urgent,
    created_at: "2026-09-28T12:00:00Z",
  })
    ?.toISOString()
    .slice(0, 10);
describe("designer SLA urgency", () => {
  it("uses urgent SLA independently of art need and for legacy", () => {
    expect(date("CRIACAO_ARTE", true)).toBe("2026-09-29");
    expect(date("ARTE_PRONTA_EDICAO", true)).toBe("2026-09-29");
    expect(date("URGENTE", false)).toBe("2026-09-29");
  });
  it("preserves normal art SLAs", () => {
    expect(date("CRIACAO_ARTE", false)).toBe("2026-10-01");
    expect(date("ARTE_PRONTA_EDICAO", false)).toBe("2026-09-30");
  });
});
