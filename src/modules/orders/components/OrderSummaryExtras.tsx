import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";
import type { OrderItem } from "../types/orderDetail";

type Props = {
  items: OrderItem[];
  itemsLoaded: boolean;
  itemsError: string | null;
  files: OsOrderLayoutAsset[];
  filesLoaded: boolean;
  filesError?: string | null;
  onGoItems: () => void;
  onGoItem: (id: string) => void;
  onFetchReference: (asset: OsOrderLayoutAsset) => Promise<string>;
};

/** Only presents data actually fetched for this OS. It does not approve artwork or create files. */
export function OrderSummaryExtras({
  items, itemsLoaded, itemsError, files, filesLoaded, filesError,
  onGoItems, onGoItem, onFetchReference
}: Props) {
  const image = files.find(asset => asset.asset_type === "LAYOUT" &&
    asset.mime_type?.startsWith("image/") && Boolean(asset.object_path));
  const [url, setUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setUrl(null);
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setImageBroken(false);
    return () => { generation.current++; };
  }, [image?.id]);
  const openPreview = async () => {
    if (!image || pending.current) return;
    pending.current = true;
    const request = ++generation.current;
    setPreviewLoading(true);
    setPreviewError(null);
    setImageBroken(false);
    try {
      const signed = await onFetchReference(image);
      if (request !== generation.current) return;
      const target = new URL(signed);
      if (target.protocol !== "https:") throw new Error("Invalid URL");
      setUrl(signed);
      setPreviewOpen(true);
    } catch {
      if (request === generation.current)
        setPreviewError("Referência indisponível. Confira a aba Arquivos e tente novamente.");
    } finally {
      if (request === generation.current) {
        pending.current = false;
        setPreviewLoading(false);
      }
    }
  };
  return <div className="min-w-0 space-y-4">
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Produtos da OS</CardTitle>
        {itemsLoaded && !itemsError && <span className="text-sm text-muted-foreground">{items.length} item(ns)</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        {itemsError
          ? <p role="status" className="text-sm text-muted-foreground">Lista indisponível. Consulte a aba Itens para tentar novamente.</p>
          : !itemsLoaded
            ? <p role="status" className="text-sm text-muted-foreground">Carregando produtos cadastrados…</p>
            : !items.length
              ? <p className="text-sm text-muted-foreground">Nenhum item estruturado cadastrado.</p>
              : <ol className="divide-y rounded-lg border">{items.slice(0, 5).map(item => <li key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <button type="button" className="min-h-10 break-words text-left text-sm font-semibold hover:underline"
                      onClick={() => onGoItem(item.id)}>{item.name}</button>
                    {item.description && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                </li>)}</ol>}
        {itemsLoaded && !itemsError && items.length > 5 &&
          <p className="text-xs text-muted-foreground">Mais {items.length - 5} produto(s) na lista completa.</p>}
        <Button type="button" className="min-h-11" variant="outline" onClick={onGoItems}>
          Ver todos os itens <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>

    <Card className="min-w-0">
      <CardHeader><CardTitle>Referência visual</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Arquivos cadastrados para consulta. Uma referência não representa aprovação da arte.
        </p>
        {image
          ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <ImageIcon aria-hidden="true" className="size-5 shrink-0" />
                <span className="break-words text-sm">{image.original_name || "Imagem de referência"}</span>
              </div>
              <Button type="button" variant="outline" className="min-h-11"
                disabled={previewLoading} onClick={() => void openPreview()}>
                {previewLoading ? "Abrindo…" : "Visualizar imagem"}
              </Button>
            </div>
          : <p className="text-sm text-muted-foreground">
              {filesError ? "Referências indisponíveis. Consulte a aba Arquivos para tentar novamente."
                : filesLoaded ? "Nenhuma imagem de layout cadastrada."
                  : "Buscando referências disponíveis…"}
            </p>}
        {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
      </CardContent>
    </Card>
    <Dialog open={previewOpen} onOpenChange={next => {
      setPreviewOpen(next);
      if (!next) { generation.current++; setUrl(null); }
    }}>
      <DialogContent className="max-h-[95dvh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Referência visual cadastrada</DialogTitle>
          <DialogDescription>Visualização somente leitura, sem aprovação de arte.</DialogDescription>
        </DialogHeader>
        {url && !imageBroken
          ? <img src={url} alt={"Referência visual: " + (image?.original_name || "imagem de layout")}
              onError={() => setImageBroken(true)} className="max-h-[75dvh] w-full object-contain" />
          : <p role="alert" className="rounded-lg border p-4 text-sm">Não foi possível exibir a imagem. Consulte a aba Arquivos.</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
