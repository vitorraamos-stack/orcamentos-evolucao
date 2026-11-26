import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyCommercialBriefing, emptyCommercialBriefingItem } from "./commercialBriefingDomain";
import { BriefingConsultationResult } from "./DigisacContextPilot";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("consultation opened from Digisac", () => {
  it("renders the single briefing with inactive fields and no editing actions", () => {
    const draft = {
      ...emptyCommercialBriefing(),
      clientName: "Cliente de teste",
      items: [{
        ...emptyCommercialBriefingItem("10000000-0000-4000-8000-000000000001"),
        name: "Item de teste",
      }],
    };
    const html = renderToStaticMarkup(<BriefingConsultationResult result={{
      kind: "found", briefing: { state: "draft", draft },
    }} />);
    expect(html).toContain('aria-label="Briefing encontrado"');
    expect(html).toContain("Cliente de teste");
    expect(html).toContain("Item de teste");
    const fields = html.match(/<(?:input|textarea|select)\b[^>]*>/g) ?? [];
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every(field => field.includes('disabled=""'))).toBe(true);
    expect(html).not.toMatch(/Adicionar item|Remover item|Salvar|Cancelar negociação/);
  });

  it.each([
    ["none", "Nenhum briefing encontrado"],
    ["multiple", "Mais de um briefing encontrado"],
  ] as const)("shows a message and no record in the %s case", (kind, message) => {
    const html = renderToStaticMarkup(<BriefingConsultationResult result={{ kind }} />);
    expect(html).toContain(message);
    expect(html).not.toMatch(/aria-label="Briefing encontrado"|<input|<button/);
  });
});
