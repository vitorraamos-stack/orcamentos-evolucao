import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hubOsSource = readFileSync(
  new URL("./HubOS.tsx", import.meta.url),
  "utf8"
);

describe("HubOS Produção Externa flow contract", () => {
  it("supports productionTag options when moving cards on the Arte board", () => {
    expect(hubOsSource).toContain("productionTag");
    expect(hubOsSource).toContain('"PRODUCAO_EXTERNA"');
    expect(hubOsSource).toContain("production_tag: nextProductionTag");

    expect(hubOsSource).toMatch(
      /const moveOrderToArtStatus = async \(\s*order: OsOrder,\s*nextStatus: ArtStatus,\s*options: MoveOrderToArtStatusOptions = \{\}\s*\)/
    );
  });

  it("passes productionTag options from both layout modal actions", () => {
    const withoutLayoutMatch = hubOsSource.match(
      /const handleMoveWithoutLayout = async \(\) => \{[\s\S]*?const handleUploadLayoutAndMove = async/
    );
    const withLayoutMatch = hubOsSource.match(
      /const handleUploadLayoutAndMove = async \(\) => \{[\s\S]*?const handleCopyApprovalText = async/
    );

    expect(withoutLayoutMatch?.[0]).toContain("getProduzirMoveOptions()");
    expect(withoutLayoutMatch?.[0]).toContain("moveOrderToArtStatus(");
    expect(withLayoutMatch?.[0]).toContain("getProduzirMoveOptions()");
    expect(withLayoutMatch?.[0]).toContain("moveOrderToArtStatus(");
  });

  it("persists the production tag through its dedicated operational contract", () => {
    const moveFunctionMatch = hubOsSource.match(
      /const moveOrderToArtStatus = async \([\s\S]*?const handleDragEndArte = async/
    );

    expect(moveFunctionMatch?.[0]).toContain("await setProductionTag(");
    expect(moveFunctionMatch?.[0]).toContain("nextProductionTag,");
    expect(moveFunctionMatch?.[0]).toContain('source: "kanban"');
  });

  it("does not use legacy fields from the other Hub OS module", () => {
    expect(hubOsSource).not.toContain("is_producao_externa");
    expect(hubOsSource).not.toContain("status_producao");
    expect(hubOsSource).not.toContain("status_arte");
  });
});
