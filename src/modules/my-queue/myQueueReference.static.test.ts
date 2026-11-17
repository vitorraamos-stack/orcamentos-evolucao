import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./MyQueueReferenceView.tsx", import.meta.url), "utf8");
const viewCss = readFileSync(new URL("./my-queue-reference.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../components/QueueReferenceShell.tsx", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../../components/queue-reference-shell.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../components/Layout.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./MyQueuePage.tsx", import.meta.url), "utf8");

describe("Minha Fila — referência visual aprovada", () => {
  it("reproduces titles, counters, filters and right panels without fixture data", () => {
    for (const label of [
      "ESPAÇO PESSOAL / PROPOSTA 1", "Minha fila de trabalho",
      "Minhas tarefas", "Atrasadas", "Vencem hoje", "Em espera",
      "Minhas próximas ações", "ORDEM DE SERVIÇO", "MINHA AÇÃO",
      "PRAZO", "PRIORIDADE", "Aguardando terceiros", "Próximos prazos",
      "Ver todas", "Lista",
    ]) {
      expect(view).toContain(label);
    }
    expect(view).toContain("filtered.slice(0, PREVIEW_COUNT)");
    expect(view).toContain("onExecute(row)");
    expect(view).not.toContain("Cliente Exemplo");
  });

  it("uses the whole available workspace, fixed sidebar and exact dark palette", () => {
    expect(layout).toContain('if (location === "/minha-fila") return <QueueReferenceShell>');
    expect(shellCss).toContain("grid-template-columns: 220px minmax(0, 1fr)");
    expect(shellCss).toContain("height: 100dvh");
    expect(shellCss).toContain("--myq-bg: #0b1219");
    expect(shellCss).toContain("--myq-panel: #162631");
    expect(viewCss).toContain("grid-template-columns: minmax(0,1fr) 275px");
    expect(viewCss).toContain("min-height: 100%");
    expect(viewCss).not.toContain("max-width: 1840px");
  });

  it("keeps initial-based navigation, auth checks and operational actions", () => {
    for (const initial of ["MP", "OS", "AG", "AR", "PR", "IN"]) {
      expect(shell).toContain('initials: "' + initial + '"');
    }
    expect(shell).toContain('canAccessOperationalSection(access, "art")');
    expect(shell).toContain('canAccessOperationalSection(access, "production")');
    expect(page).toContain("moveBoardOrder");
    expect(page).toContain("setItemOperationStatus");
    expect(page).toContain("<ArtworkProductionLayoutDialog");
  });

  it("is responsive and supports the mobile navigation overlay", () => {
    expect(shell).toContain("<SheetContent");
    expect(shellCss).toContain("@media (max-width: 767px)");
    expect(viewCss).toContain("@media (max-width: 640px)");
  });
});
