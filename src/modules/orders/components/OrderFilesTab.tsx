import { useRef, useState } from "react";
import { ClipboardList, ExternalLink, FileImage, FileText, Paperclip, ReceiptText, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";

const ASSET_LABEL: Record<OsOrderLayoutAsset["asset_type"], string> = {
  CLIENT_FILE: "Arquivo do cliente",
  PAYMENT_PROOF: "Comprovante de pagamento",
  PURCHASE_ORDER: "Pedido de compra",
  LAYOUT: "Layout",
  INSTALLATION_EVIDENCE: "Evidência de instalação",
};

const ASSET_ICON: Record<OsOrderLayoutAsset["asset_type"], LucideIcon> = {
  CLIENT_FILE: Paperclip,
  PAYMENT_PROOF: ReceiptText,
  PURCHASE_ORDER: ClipboardList,
  LAYOUT: FileImage,
  INSTALLATION_EVIDENCE: FileImage,
};

export function orderFileName(asset: Pick<OsOrderLayoutAsset, "original_name" | "object_path">): string {
  return asset.original_name?.trim() || asset.object_path.split("/").pop()?.trim() || "Arquivo sem nome";
}

export function orderFileSize(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size) || size < 0) return "Tamanho indisponível";
  if (size < 1024) return `${size} B`;
  const format = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
  if (size < 1024 * 1024) return `${format(size / 1024)} KB`;
  if (size < 1024 ** 3) return `${format(size / 1024 ** 2)} MB`;
  return `${format(size / 1024 ** 3)} GB`;
}

export type OrderFilePopup = {
  opener: unknown;
  location: { replace: (url: string) => void };
  close: () => void;
};

/**
 * A new tab must be opened synchronously from the user's click; waiting for
 * the signed URL first is commonly blocked as an unsolicited popup.
 * The presigned URL remains private to the browser and is never rendered.
 */
export async function openOrderFileWindow(
  requestSignedUrl: () => Promise<string>,
  openBlankWindow: () => OrderFilePopup | null,
): Promise<void> {
  const popup = openBlankWindow();
  if (!popup) {
    throw new Error("O navegador bloqueou a nova aba. Permita pop-ups para este site e tente novamente.");
  }
  try {
    popup.opener = null;
    const url = await requestSignedUrl();
    const destination = new URL(url);
    if (destination.protocol !== "https:" || !destination.hostname) {
      throw new Error("Link temporário inválido.");
    }
    popup.location.replace(url);
  } catch (error) {
    popup.close();
    throw error;
  }
}

function safeFileOpenError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("O navegador bloqueou a nova aba.")) {
    return error.message;
  }
  // Backend errors may contain private storage paths or signed-link details.
  return "Não foi possível abrir este arquivo. Verifique seu acesso ou tente novamente.";
}

export function OrderFilesTab({
  assets,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  assets: OsOrderLayoutAsset[];
  loading: boolean;
  error: string | null;
  onOpen: (asset: OsOrderLayoutAsset) => Promise<void>;
  onRetry?: () => void;
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ assetId: string; text: string } | null>(null);
  const openingRef = useRef(false);
  const openFile = async (asset: OsOrderLayoutAsset) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpeningId(asset.id);
    setOpenError(null);
    try {
      await onOpen(asset);
    } catch (error) {
      setOpenError({ assetId: asset.id, text: safeFileOpenError(error) });
    } finally {
      openingRef.current = false;
      setOpeningId(null);
    }
  };

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Carregando arquivos…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
    <p className="min-w-0 break-words text-sm text-destructive">Não foi possível carregar os arquivos: {error}</p>
    {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Tentar novamente</Button>}
  </div>;
  if (!assets.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum arquivo disponível.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Arquivos da OS">
      {assets.map(asset => {
        const name = orderFileName(asset);
        const AssetIcon = ASSET_ICON[asset.asset_type] ?? FileText;
        return (
          <div key={asset.id} className="min-w-0 space-y-2">
            <div className="flex min-w-0 items-start gap-3 rounded-lg border p-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <AssetIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium leading-snug [overflow-wrap:anywhere]" title={name}>{name}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{ASSET_LABEL[asset.asset_type] ?? asset.asset_type}</span>
                <span aria-hidden="true">·</span>
                <span>{orderFileSize(asset.size_bytes)}</span>
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0 gap-1.5 sm:min-h-9"
              aria-label={`Abrir arquivo: ${name}`}
              aria-busy={openingId === asset.id}
              disabled={openingId !== null}
              onClick={() => void openFile(asset)}
            >
              {openingId === asset.id ? "Abrindo…" : "Abrir"}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Button>
            </div>
            {openError?.assetId === asset.id && (
              <p role="alert" className="break-words px-1 text-sm text-destructive">{openError.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
