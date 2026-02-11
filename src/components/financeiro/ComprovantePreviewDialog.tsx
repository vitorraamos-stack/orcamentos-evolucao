import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ComprovantePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  previewUrl?: string | null;
  filename: string | null;
  loading: boolean;
  error: string | null;
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

const getExtension = (filename: string | null) => {
  if (!filename || !filename.includes(".")) return null;
  return filename.split(".").pop()?.toLowerCase() ?? null;
};

export function ComprovantePreviewDialog({
  open,
  onOpenChange,
  url,
  previewUrl,
  filename,
  loading,
  error,
}: ComprovantePreviewDialogProps) {
  const [zoom, setZoom] = useState(1);

  const fileType = useMemo(() => {
    const extension = getExtension(filename);
    if (!extension) return "other";
    if (IMAGE_EXTENSIONS.has(extension)) return "image";
    if (extension === "pdf") return "pdf";
    return "other";
  }, [filename]);

  useEffect(() => {
    if (!open) {
      setZoom(1);
    }
  }, [open]);

  const canOpen = Boolean(url);
  const displayUrl = previewUrl ?? url;

  const openInNewTab = () => {
    if (!url) return;
    window.open(url, "_blank", "noreferrer");
  };

  const downloadFile = () => {
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    if (filename) {
      anchor.download = filename;
    }
    anchor.rel = "noreferrer";
    anchor.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl max-h-[95vh] overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Comprovante: {filename ?? "Comprovante"}</DialogTitle>
        </DialogHeader>

        <div className="h-[80vh] w-full bg-background">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Carregando preview...
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Você ainda pode tentar baixar ou abrir o arquivo em nova aba.
              </p>
            </div>
          )}

          {!loading && !error && displayUrl && fileType === "image" && (
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setZoom(current =>
                      Math.max(0.5, Number((current - 0.25).toFixed(2)))
                    )
                  }
                >
                  -
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setZoom(current =>
                      Math.min(4, Number((current + 0.25).toFixed(2)))
                    )
                  }
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(1)}
                >
                  Reset
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                <img
                  src={displayUrl}
                  alt={filename ?? "Comprovante"}
                  className="max-h-full w-auto object-contain"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </div>
          )}

          {!loading && !error && displayUrl && fileType === "pdf" && (
            <iframe
              src={displayUrl}
              title={filename ?? "Comprovante PDF"}
              className="h-full w-full"
            />
          )}

          {!loading && !error && displayUrl && fileType === "other" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm">
                Pré-visualização indisponível para este formato.
              </p>
              <p className="text-xs text-muted-foreground">
                Use os botões abaixo para abrir ou baixar o comprovante.
              </p>
            </div>
          )}

          {!loading && !error && !canOpen && (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Nenhuma URL de visualização disponível.
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={!canOpen}
            onClick={downloadFile}
          >
            Baixar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canOpen}
            onClick={openInNewTab}
          >
            Abrir em nova aba
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
