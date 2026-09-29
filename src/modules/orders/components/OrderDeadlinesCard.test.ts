import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatDeadlineDate, getContractedDeadlineLabel } from "./OrderDeadlinesCard";

const source = readFileSync(new URL("./OrderDeadlinesCard.tsx", import.meta.url), "utf8");

describe("OrderDeadlinesCard", () => {
  it("formats STANDARD_8_12 before and after production", () => {
    expect(getContractedDeadlineLabel("STANDARD_8_12")).toBe("8 a 12 dias úteis após a aprovação da arte");
    expect(formatDeadlineDate(null)).toBeNull();
    expect(formatDeadlineDate("2026-09-29T14:30:00.000Z")).toBe("29/09/2026");
    expect(formatDeadlineDate("2026-10-15")).toBe("15/10/2026");
  });

  it("supports custom and legacy orders", () => {
    expect(getContractedDeadlineLabel("CUSTOM")).toBe("Prazo personalizado");
    expect(getContractedDeadlineLabel(null)).toBe("Não definido");
    expect(source).toContain('order.delivery_deadline_preset === "CUSTOM" ? "Ainda não definido"');
  });

  it("keeps only the three team-controlled stages in the collapsed section", () => {
    const scopes = source.slice(source.indexOf("const internalScopes"), source.indexOf("const stateLabel"));
    expect(scopes).toContain('value: "ART"');
    expect(scopes).toContain('value: "PRODUCTION"');
    expect(scopes).toContain('value: "FINISHING"');
    expect(scopes).not.toContain('value: "APPROVAL"');
    expect(scopes).not.toContain('value: "INSTALLATION"');
    expect(source).toContain('<Collapsible className="group border-t pt-3">');
    expect(source).not.toContain("defaultOpen");
  });

  it("gates internal editing and never renders an input for delivery_date", () => {
    expect(source).toContain("canEdit && (editing === scope.value || !deadline)");
    expect(source).toContain("canEdit && deadline && <DropdownMenu>");
    expect(source.match(/<Input/g)).toHaveLength(1);
    expect(source).not.toContain("onChange(order.delivery_date");
  });
});
