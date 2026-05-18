import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const agentSource = readFileSync(
  new URL("./agent.js", import.meta.url),
  "utf8"
);

const isRetentionProtectedAsset = asset => {
  const objectPath = asset.object_path || "";
  const normalizedPath = objectPath.toLowerCase();

  return (
    asset.asset_type === "PAYMENT_PROOF" ||
    asset.asset_type === "LAYOUT" ||
    normalizedPath.includes("/arte/layout/") ||
    objectPath.includes("/Financeiro/Comprovante/") ||
    normalizedPath.includes("/financeiro/comprovante/") ||
    normalizedPath.includes("/payment_proofs/")
  );
};

describe("os-asset-agent retention cleanup safeguards", () => {
  it("preserva layouts e comprovantes, mas permite limpar arquivos comuns", () => {
    expect(
      isRetentionProtectedAsset({
        asset_type: "LAYOUT",
        object_path: "os_orders/abc/Arte/Layout/arquivo.pdf",
      })
    ).toBe(true);

    expect(
      isRetentionProtectedAsset({
        asset_type: undefined,
        object_path: "os_orders/abc/Arte/Layout/arquivo.pdf",
      })
    ).toBe(true);

    expect(
      isRetentionProtectedAsset({
        asset_type: "PAYMENT_PROOF",
        object_path: "os_orders/abc/Financeiro/Comprovante/comprovante.pdf",
      })
    ).toBe(true);

    expect(
      isRetentionProtectedAsset({
        asset_type: "CLIENT_FILE",
        object_path: "os_orders/abc/arquivo_cliente.pdf",
      })
    ).toBe(false);
  });

  it("mantém asset_type no select do cleanup e protege /Arte/Layout/", () => {
    expect(agentSource).toMatch(
      /\.select\(\s*"id, object_path, storage_provider, storage_bucket, bucket, asset_type"\s*\)/
    );
    expect(agentSource).toContain('asset.asset_type === "LAYOUT"');
    expect(agentSource).toContain('normalizedPath.includes("/arte/layout/")');
    expect(agentSource).toContain(
      "const cleanupCandidates = pendingAssets.filter("
    );
    expect(agentSource).toContain("asset => !isRetentionProtectedAsset(asset)");
  });
});
