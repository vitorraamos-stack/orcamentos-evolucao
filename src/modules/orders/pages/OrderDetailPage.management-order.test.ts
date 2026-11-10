import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");

describe("OS Resumo — ordem dos cartões de gestão", () => {
  it("exibe Prazos antes de Responsáveis, sem duplicar nenhum deles", () => {
    const start = source.indexOf('<section aria-label="Responsáveis e prazos"');
    const end = source.indexOf("</section>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = source.slice(start, end);
    const deadlines = section.indexOf("<OrderDeadlinesCard");
    const assignees = section.indexOf("<OrderAssigneesCard");
    expect(deadlines).toBeGreaterThan(-1);
    expect(assignees).toBeGreaterThan(deadlines);
    expect((section.match(/<OrderDeadlinesCard/g) ?? []).length).toBe(1);
    expect((section.match(/<OrderAssigneesCard/g) ?? []).length).toBe(1);
  });

  it("preserva os manipuladores e a disposição vertical dos cartões", () => {
    const start = source.indexOf('<section aria-label="Responsáveis e prazos"');
    const end = source.indexOf("</section>", start);
    const section = source.slice(start, end);
    expect(section).toContain('onChange={updateDeadline}');
    expect(section).toContain('onChange={updateAssignee}');
    expect(section).toContain('onComplete={(scope, version) => deadlineAction(scope, "complete", version)}');
    expect(styles).toContain(".evolu-detail__summary-columns .evolu-detail__management-grid");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
  });
});
