import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchOsAssetBlobUrl, fetchOsAssetDownloadUrl } from "../api";
import { resolveLayoutPreviewKind } from "../layoutPreview";

export type LayoutPreviewAsset = {
  id: string;
  object_path: string;
  original_name: string | null;
  mime_type: string | null;
  uploaded_at?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layoutAsset: LayoutPreviewAsset | null;
};

type PreviewState = "idle" | "loading" | "loaded" | "unsupported" | "error";

type CachedAsset = {
  blobUrl: string;
  downloadUrl: string;
};

export function OsLayoutPreviewDialog({
  open,
  onOpenChange,
  layoutAsset,
}: Props) {
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [openingExternal, setOpeningExternal] = useState(false);
  const cacheRef = useRef<Map<string, CachedAsset>>(new Map());
  const kind = useMemo(
    () => (layoutAsset ? resolveLayoutPreviewKind(layoutAsset) : "unsupported"),
    [layoutAsset]
  );
  const isPrintable = kind === "pdf" || kind === "image";

  useEffect(() => {
    return () => {
      cacheRef.current.forEach(item => URL.revokeObjectURL(item.blobUrl));
      cacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!layoutAsset?.object_path) {
      setPreviewState("error");
      setBlobUrl(null);
      setPreviewUrl(null);
      setDownloadUrl(null);
      return;
    }

    if (kind === "unsupported") {
      setPreviewState("unsupported");
      setBlobUrl(null);
      setPreviewUrl(null);
      setDownloadUrl(null);
      return;
    }

    const cacheKey = `${layoutAsset.id}:${layoutAsset.object_path}`;
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      setBlobUrl(cached.blobUrl);
      setPreviewUrl(cached.blobUrl);
      setDownloadUrl(cached.downloadUrl);
      setPreviewState("loaded");
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    setPreviewState("loading");
    setBlobUrl(null);
    setPreviewUrl(null);
    setDownloadUrl(null);

    void (async () => {
      try {
        const { blobUrl: nextBlobUrl, downloadUrl: nextDownloadUrl } =
          await fetchOsAssetBlobUrl(
            layoutAsset.object_path,
            layoutAsset.original_name ?? undefined,
            controller.signal
          );

        if (!isMounted) {
          URL.revokeObjectURL(nextBlobUrl);
          return;
        }

        cacheRef.current.set(cacheKey, {
          blobUrl: nextBlobUrl,
          downloadUrl: nextDownloadUrl,
        });
        setBlobUrl(nextBlobUrl);
        setPreviewUrl(nextBlobUrl);
        setDownloadUrl(nextDownloadUrl);
        setPreviewState("loaded");
      } catch (error) {
        if (
          !isMounted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return;
        try {
          const fallbackDownloadUrl = await fetchOsAssetDownloadUrl(
            layoutAsset.object_path,
            layoutAsset.original_name ?? undefined
          );
          if (!isMounted) return;
          setBlobUrl(null);
          setPreviewUrl(fallbackDownloadUrl);
          setDownloadUrl(fallbackDownloadUrl);
          setPreviewState("loaded");
          toast.warning(
            "Preview carregado em modo compatível. A impressão pode variar conforme o navegador."
          );
        } catch (fallbackError) {
          console.error(error);
          console.error(fallbackError);
          setPreviewState("error");
          toast.error(
            error instanceof Error
              ? error.message
              : "Falha ao carregar preview do layout."
          );
        }
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [kind, layoutAsset, open]);

  const handleOpenExternal = async () => {
    if (!layoutAsset?.object_path) {
      toast.error("Layout indisponível para download.");
      return;
    }

    try {
      setOpeningExternal(true);
      const nextDownloadUrl =
        downloadUrl ||
        (await fetchOsAssetDownloadUrl(
          layoutAsset.object_path,
          layoutAsset.original_name ?? undefined
        ));
      setDownloadUrl(nextDownloadUrl);
      window.open(nextDownloadUrl, "_blank", "noreferrer");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao abrir layout em nova aba."
      );
    } finally {
      setOpeningExternal(false);
    }
  };

  const handlePrint = () => {
    const printableUrl = blobUrl ?? previewUrl ?? downloadUrl;
    if (!printableUrl || !isPrintable) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(
        "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up."
      );
      return;
    }

    setIsPrinting(true);

    const doc = printWindow.document;
    doc.open();
    doc.write(
      "<!doctype html><html><head><title>Imprimir layout</title></head><body></body></html>"
    );
    doc.close();

    if (kind === "pdf") {
      const iframe = doc.createElement("iframe");
      iframe.src = printableUrl;
      iframe.style.border = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100vh";
      iframe.onload = () => {
        window.setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 300);
      };
      doc.body.style.margin = "0";
      doc.body.appendChild(iframe);
      setIsPrinting(false);
      return;
    }

    const image = doc.createElement("img");
    image.src = printableUrl;
    image.alt = "Layout da OS";
    image.style.maxWidth = "100%";
    image.style.maxHeight = "100vh";
    image.style.objectFit = "contain";
    image.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
    doc.body.style.margin = "0";
    doc.body.style.display = "flex";
    doc.body.style.alignItems = "center";
    doc.body.style.justifyContent = "center";
    doc.body.appendChild(image);
    setIsPrinting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[98vw] max-w-[1500px] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Preview do layout</DialogTitle>
          <DialogDescription>
            {layoutAsset?.original_name || "Arquivo de layout"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20">
          {previewState === "loading" ? (
            <div className="flex h-full min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando preview do layout...
            </div>
          ) : null}

          {previewState === "loaded" && kind === "pdf" && previewUrl ? (
            <iframe
              title="Preview do layout PDF"
              src={previewUrl}
              className="h-full min-h-[560px] w-full"
            />
          ) : null}

          {previewState === "loaded" && kind === "image" && previewUrl ? (
            <div className="flex h-full min-h-[560px] items-start justify-center overflow-auto p-4">
              <img
                src={previewUrl}
                alt="Preview do layout da OS"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : null}

          {previewState === "unsupported" ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-medium">
                Este formato não possui visualização embutida no navegador.
              </p>
              <p className="text-xs text-muted-foreground">
                Use “Abrir em nova aba” para baixar ou abrir no aplicativo
                compatível.
              </p>
            </div>
          ) : null}

          {previewState === "error" ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-medium">
                Não foi possível carregar o preview deste layout.
              </p>
              <p className="text-xs text-muted-foreground">
                Você ainda pode tentar abrir o arquivo em uma nova aba.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleOpenExternal()}
              disabled={openingExternal}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {openingExternal ? "Abrindo..." : "Abrir em nova aba"}
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!isPrintable || previewState !== "loaded" || isPrinting}
            >
              <Printer className="mr-2 h-4 w-4" />
              {isPrinting ? "Preparando..." : "Imprimir"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
