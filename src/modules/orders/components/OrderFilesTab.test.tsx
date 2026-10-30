import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";
import { OrderFilesTab, openOrderFileWindow, orderFileName, orderFileSize } from "./OrderFilesTab";

const asset: OsOrderLayoutAsset = {
  id: "asset-1", os_id: "os-1", asset_type: "CLIENT_FILE",
  object_path: "orders/os-1/client-file/arte-final.pdf",
  original_name: "arte final aprovada pela cliente.pdf", mime_type: "application/pdf",
  size_bytes: 1024 * 1024, storage_provider: "r2", storage_bucket: null,
  bucket: null, uploaded_at: "2026-10-14T12:00:00Z",
};

function view(assets: OsOrderLayoutAsset[], options?: { loading?: boolean; error?: string | null; retry?: boolean }) {
  return renderToStaticMarkup(
    <OrderFilesTab
      assets={assets} loading={options?.loading ?? false}
      error={options?.error ?? null} onOpen={vi.fn()} onRetry={options?.retry ? vi.fn() : undefined}
    />
  );
}

describe("EvoluSystem OS files", () => {
  it("renders complete names, type, size and specific accessible open actions", () => {
    const html = view([asset, { ...asset, id: "asset-2", asset_type: "PAYMENT_PROOF", original_name: "comprovante.pdf", size_bytes: 0 }]);
    expect(html).toContain("arte final aprovada pela cliente.pdf");
    expect(html).toContain("Arquivo do cliente");
    expect(html).toContain("Comprovante de pagamento");
    expect(html).toContain("1 MB");
    expect(html).toContain("0 B");
    expect(html).toContain("Abrir arquivo: arte final aprovada pela cliente.pdf");
    expect(html).toContain("Abrir arquivo: comprovante.pdf");
    expect(html).toContain("overflow-wrap:anywhere");
    expect((html.match(/aria-label="Abrir arquivo:/g) ?? []).length).toBe(2);
  });

  it("identifies layouts, purchase orders and installation evidence with the original labels", () => {
    const html = view([
      { ...asset, id: "asset-layout", asset_type: "LAYOUT" },
      { ...asset, id: "asset-purchase", asset_type: "PURCHASE_ORDER" },
      { ...asset, id: "asset-evidence", asset_type: "INSTALLATION_EVIDENCE" },
    ]);
    for (const label of ["Layout", "Pedido de compra", "Evidência de instalação"]) {
      expect(html).toContain(label);
    }
  });

  it("falls back to the file basename without exposing its complete storage path", () => {
    expect(orderFileName({ original_name: null, object_path: "orders/os-1/a/arquivo-cliente.pdf" })).toBe("arquivo-cliente.pdf");
    expect(orderFileName({ original_name: " ", object_path: "orders/os-1/a/arquivo-cliente.pdf" })).toBe("arquivo-cliente.pdf");
    expect(orderFileName({ original_name: "", object_path: "" })).toBe("Arquivo sem nome");
    expect(view([{ ...asset, original_name: null }])).not.toContain("orders/os-1/client-file/");
  });

  it("distinguishes zero, byte, KB, MB and GB sizes, with safe missing-data fallbacks", () => {
    expect(orderFileSize(0)).toBe("0 B");
    expect(orderFileSize(512)).toBe("512 B");
    expect(orderFileSize(1024)).toBe("1 KB");
    expect(orderFileSize(1536)).toBe("1,5 KB");
    expect(orderFileSize(1048576)).toBe("1 MB");
    expect(orderFileSize(1073741824)).toBe("1 GB");
    expect(orderFileSize(null)).toBe("Tamanho indisponível");
    expect(orderFileSize(-1)).toBe("Tamanho indisponível");
  });

  it("preserves loading, error, empty states and read-only file actions", () => {
    expect(view([], { loading: true })).toContain("Carregando arquivos");
    expect(view([], { error: "Não foi possível carregar." })).toContain('role="alert"');
    expect(view([], { error: "Falha na rede", retry: true })).toContain("Tentar novamente");
    expect(view([])).toContain("Nenhum arquivo disponível nesta OS.");
    expect(view([asset])).not.toContain("Excluir");
    expect(view([asset])).not.toContain("Enviar arquivo");
  });
});

describe("EvoluSystem — secure file opening", () => {
  const signed = "https://storage.example.test/signed.pdf?token=synthetic";

  function blankWindow() {
    return {
      opener: { unsafe: true } as unknown,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
  }

  it("opens a blank tab before requesting a temporary link, without an opener", async () => {
    const popup = blankWindow();
    const order: string[] = [];
    const open = vi.fn(() => { order.push("open"); return popup; });
    const request = vi.fn(async () => {
      order.push("request");
      expect(popup.opener).toBeNull();
      return signed;
    });
    await openOrderFileWindow(request, open);
    expect(order).toEqual(["open", "request"]);
    expect(popup.location.replace).toHaveBeenCalledWith(signed);
    expect(popup.close).not.toHaveBeenCalled();
  });

  it("does not request a signed link when the browser blocks new tabs", async () => {
    const request = vi.fn().mockResolvedValue(signed);
    await expect(openOrderFileWindow(request, () => null)).rejects.toThrow("O navegador bloqueou");
    expect(request).not.toHaveBeenCalled();
  });

  it("closes the temporary blank tab if permission or signing fails", async () => {
    const popup = blankWindow();
    await expect(openOrderFileWindow(() => Promise.reject(new Error("internal/r2/secret-path")), () => popup)).rejects.toThrow("internal/r2/secret-path");
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it("never navigates to javascript or unencrypted temporary URLs", async () => {
    for (const unsafe of ["javascript:alert(1)", "http://storage.example.test/file", "data:text/plain,test"]) {
      const popup = blankWindow();
      await expect(openOrderFileWindow(async () => unsafe, () => popup)).rejects.toThrow("Link temporário inválido.");
      expect(popup.location.replace).not.toHaveBeenCalled();
      expect(popup.close).toHaveBeenCalledOnce();
    }
  });

  it("does not expose internal storage paths or temporary links in file cards", () => {
    const html = view([{ ...asset, original_name: null }]);
    expect(html).toContain("arte-final.pdf");
    expect(html).not.toContain("orders/os-1/client-file/");
    expect(html).not.toContain("token=");
  });
});
