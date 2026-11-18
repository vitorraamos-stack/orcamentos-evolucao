import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("src/modules/my-queue/MyQueuePage.tsx", "utf8");
const view = readFileSync("src/modules/my-queue/MyQueueContent.tsx", "utf8");
const styles = readFileSync("src/modules/my-queue/my-queue-content.css", "utf8");
const shell = readFileSync("src/components/Layout.tsx", "utf8");

describe("Minha Fila — layout restrito à página", () => {
  it("mantém navegação e componentes globais originais", () => {
    expect(shell).not.toContain("QueueReferenceShell");
    expect(shell).toContain('location === "/hub-os"');
    expect(shell).toContain('isOrderDetailPage');
    expect(shell).toContain('max-w-6xl');
    expect(page).toContain("moveBoardOrder");
    expect(page).toContain("setItemOperationStatus");
    expect(page).toContain("ArtworkProductionLayoutDialog");
  });

  it("remove limite de largura apenas para a fila, sem alterar sidebar e header", () => {
    expect(styles).toContain(".evolu-shell__main > div:has(> .myq-page)");
    expect(styles).toContain("max-width: none !important");
    // O fundo deve cobrir também o padding do main, sem tocar na sidebar global.
    expect(styles).toContain(".dark .evolu-shell__main:has(.myq-page)");
    expect(styles).toContain("background: #0b1219;");
    expect(styles).toContain(".myq-page {");

    expect(styles).not.toContain(".myq-shell__sidebar");
    expect(styles).not.toContain(".myq-shell__topbar");
    expect(page).toContain("<MyQueueContent");
  });

  it("usa a composição visual e cores da referência com dados reais", () => {
    for (const title of ["Minha fila de trabalho", "Minhas tarefas", "Atrasadas",
      "Vencem hoje", "Em espera", "Minhas próximas ações", "Aguardando terceiros",
      "Próximos prazos", "ORDEM DE SERVIÇO", "MINHA AÇÃO", "PRIORIDADE"]) {
      expect(view).toContain(title);
    }
    expect(styles).toContain("#0b1219");
    expect(styles).toContain("#162631");
    expect(styles).toContain("#1c2935");
    expect(styles).toContain("grid-template-columns: minmax(0,1fr) 275px");
    expect(view).toContain("filtered.slice(0, PREVIEW_COUNT)");
    expect(view).toContain("onExecute(row)");
    expect(view).not.toContain("Mercado Aurora");
    expect(view).not.toContain("Demo");
  });

  it("tem filtros e experiência móvel sem afetar o menu principal", () => {
    expect(view).toContain('aria-label="Filtrar etapas"');
    expect(view).toContain('aria-label="Filtrar prazo"');
    expect(view).toContain('aria-label="Buscar OS, cliente ou tarefa"');
    expect(view).toContain("Ver todas");
    expect(styles).toContain("@media (max-width: 640px)");
    // A altura dos cartões não pode comprimir o título no PWA do iPhone.
    expect(styles).toContain(".myq-page__heading { min-height:0; flex:0 0 auto; }");
    expect(styles).toContain(".myq-page__metrics { flex:0 0 auto; }");
    expect(styles).toContain(".myq-page__body { flex:0 0 auto; min-height:0; }");
    expect(styles).toContain(".myq-queue-card { min-height:0; }");
  });
});
