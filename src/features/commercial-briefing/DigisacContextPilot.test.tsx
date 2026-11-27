import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCommercialBriefing, emptyCommercialBriefingItem } from "./commercialBriefingDomain";
import DigisacContextPilot, { BriefingConsultationResult } from "./DigisacContextPilot";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
afterEach(() => vi.unstubAllGlobals());

function setPage({ hash = "", search = "", embedded = false } = {}) {
  const self = {};
  vi.stubGlobal("window", {
    self,
    top: embedded ? {} : self,
    location: { pathname: "/integracoes/digisac/briefing", hash, search, href: "https://fixture.invalid/" },
  });
}

describe("briefing entry from the Digisac panel", () => {
  it("opens a new tab with contact and ticket references only", () => {
    setPage({ search: "?contact_id=c-1&ticket_id=t-1&user_id=u-1", embedded: true });
    const html = renderToStaticMarkup(<DigisacContextPilot />);
    expect(html).toContain('href="/integracoes/digisac/briefing#criar?contact_id=c-1&amp;ticket_id=t-1" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Abrir briefing no EvoluSystem");
    expect(html).not.toContain("Salvar briefing");
  });

  it("only opens the creation route in a top-level tab", () => {
    const hash = "#criar?contact_id=c-1&ticket_id=t-1";
    setPage({ hash, embedded: true });
    expect(renderToStaticMarkup(<DigisacContextPilot />)).not.toContain("Verificando sessão do EvoluSystem");
    setPage({ hash });
    expect(renderToStaticMarkup(<DigisacContextPilot />)).toContain("Verificando sessão do EvoluSystem");
  });
});

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
      kind: "found", briefing: { state: "draft", draft }, revision: 2, lastSavedAt: "2026-11-27T01:05:09+00:00",
      lastSavedBy: "Consultora de Teste",
      history: {
        entries: [
          { revision: 2, occurredAt: "2026-11-27T01:05:09+00:00", event: "SAVED", authorName: "Consultora de Teste" },
          { revision: 1, occurredAt: "2026-11-26T20:00:09+00:00", event: "CREATED", authorName: "private@example.invalid" },
        ], nextBefore: null,
      },
    }} />);
    expect(html).toContain('aria-label="Briefing encontrado"');
    expect(html).toContain("Revisão 2");
    expect(html).toContain("Último salvamento");
    expect(html).toContain('<time dateTime="2026-11-27T01:05:09+00:00">26/11/2026, 22:05</time>');
    expect(html).toContain("Consultora de Teste");
    expect(html).toContain('aria-label="Histórico de revisões"');
    expect(html).toContain("Autor não identificado");
    expect(html).toContain("26/11/2026, 17:00");
    expect(html).not.toContain("private@example.invalid");
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
