import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Hub OS layout availability safeguards", () => {
  it("fetchLatestOrderLayout filtra e rejeita layouts inválidos", () => {
    const source = read("src/features/hubos/api.ts");

    expect(source).toContain('.eq("asset_type", "LAYOUT")');
    expect(source).toContain("deleted_from_storage_at preenchido");
    expect(source).toContain("error preenchido");
    expect(source).toContain("object_path vazio");
    expect(source).toContain("storage_provider ausente");
    expect(source).toContain("console.warn");
  });

  it("ServiceOrderDialog dá feedback e abre preview apenas com layout", () => {
    const source = read("src/features/hubos/components/ServiceOrderDialog.tsx");

    expect(source).toContain("layoutLoadError");
    expect(source).toContain("Layout indisponível");
    expect(source).toContain("Carregando layout...");
    expect(source).toContain("setIsLayoutPreviewOpen(true)");
    expect(source).toContain("<OsLayoutPreviewDialog");
  });

  it("OsKioskPage carrega layout de os_orders e exibe feedback no botão", () => {
    const source = read("src/modules/hub-os/pages/OsKioskPage.tsx");

    expect(source).toContain('selectedOrder.source_type !== "os_orders"');
    expect(source).toContain("fetchLatestOrderLayout(selectedOrder.source_id)");
    expect(source).toContain(
      'summarySelectedOrder.source_type !== "os_orders"'
    );
    expect(source).toContain(
      "fetchLatestOrderLayout(\n          summarySelectedOrder.source_id\n        )"
    );
    expect(source).toContain("Layout indisponível");
    expect(source).toContain("setIsLayoutPreviewOpen(true)");
    expect(source).toContain("<OsLayoutPreviewDialog");
  });
});
