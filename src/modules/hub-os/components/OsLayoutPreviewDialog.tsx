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
import type { OsLayoutAsset } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layoutAsset: OsLayoutAsset | null;
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
      setDownloadUrl(null);
      return;
    }

    if (kind === "unsupported") {
      setPreviewState("unsupported");
      setBlobUrl(null);
      setDownloadUrl(null);
      return;
    }

    const cacheKey = `${layoutAsset.id}:${layoutAsset.object_path}`;
    const cached = cacheRef.current.get(cacheKey);

    if (cached) {
      setBlobUrl(cached.blobUrl);
      setDownloadUrl(cached.downloadUrl);
      setPreviewState("loaded");
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    setPreviewState("loading");
    setBlobUrl(null);
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
        setDownloadUrl(nextDownloadUrl);
        setPreviewState("loaded");
      } catch (error) {
        if (
          !isMounted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return;
        console.error(error);
        setPreviewState("error");
        toast.error(
          error instanceof Error
            ? error.message
            : "Falha ao carregar preview do layout."
        );
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
    if (!blobUrl || !isPrintable) return;

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.error(
        "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up."
      );
      return;
    }

    setIsPrinting(true);

    if (kind === "pdf") {
      printWindow.document.write(`
        <html>
          <head><title>Imprimir layout</title><style>html,body,iframe{height:100%;margin:0}iframe{width:100%;border:0}</style></head>
          <body>
            <iframe id="pdf-frame" src="${blobUrl}"></iframe>
            <script>
              const frame = document.getElementById('pdf-frame');
              frame.addEventListener('load', () => {
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 250);
              });
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
      setIsPrinting(false);
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir layout</title>
          <style>
            html, body { margin: 0; padding: 0; background: white; height: 100%; }
            body { display: flex; align-items: center; justify-content: center; }
            img { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img id="layout-image" src="${blobUrl}" alt="Layout da OS" />
          <script>
            const image = document.getElementById('layout-image');
            image.addEventListener('load', () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

          {previewState === "loaded" && kind === "pdf" && blobUrl ? (
            <iframe
              title="Preview do layout PDF"
              src={blobUrl}
              className="h-full min-h-[560px] w-full"
            />
          ) : null}

          {previewState === "loaded" && kind === "image" && blobUrl ? (
            <div className="flex h-full min-h-[560px] items-start justify-center overflow-auto p-4">
              <img
                src={blobUrl}
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
