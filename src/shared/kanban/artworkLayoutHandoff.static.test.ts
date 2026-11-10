import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Entrega do layout final da Arte para Instalações", () => {
  it("intercepta a movimentação do quadro moderno antes de liberar Produção", () => {
    const board = read("src/shared/kanban/OperationalBoard.tsx");
    expect(board).toContain('board === "art" && to === "Produzir"');
    expect(board).toContain("setPendingLayoutCard(card)");
    expect(board).toContain("<ArtworkProductionLayoutDialog");
    expect(board).toContain('return performMove(currentCard, "Produzir", asset)');
  });

  it("só confirma o handoff com upload válido, evento auditado e sem opção de pular", () => {
    const dialog = read("src/modules/artwork/components/ArtworkProductionLayoutDialog.tsx");
    expect(dialog).toContain("validateFiles([candidate])");
    expect(dialog).toContain("await uploadLayoutForOrder(");
    expect(dialog).toContain('type: "layout_uploaded"');
    expect(dialog).toContain("await onConfirm(order, asset)");
    expect(dialog).toContain("disabled={!file || busy}");
    expect(dialog).not.toContain("Sem layout");
    expect(dialog).not.toContain("handleMoveWithoutLayout");
  });

  it("disponibiliza o layout em Instalações com visualização e abertura", () => {
    const installation = read("src/modules/installations/pages/InstallationExecutionPage.tsx");
    expect(installation).toContain("fetchLatestOrderLayout(osId)");
    expect(installation).toContain("Layout do pedido");
    expect(installation).toContain("<OsLayoutPreviewDialog");
    expect(installation).toContain("fetchOrderAssetDownloadUrl(");
    expect(installation).toContain("O layout final ainda não foi disponibilizado pela Arte.");
  });
});
