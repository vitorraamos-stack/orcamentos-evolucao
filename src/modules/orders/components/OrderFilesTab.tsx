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

export function OrderFilesTab({
  assets,
  loading,
  error,
  onOpen,
}: {
  assets: OsOrderLayoutAsset[];
  loading: boolean;
  error: string | null;
  onOpen: (asset: OsOrderLayoutAsset) => void;
}) {
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Carregando arquivos…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
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
          <div key={asset.id} className="flex min-w-0 items-start gap-3 rounded-lg border p-4">
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
              onClick={() => onOpen(asset)}
            >
              Abrir
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
