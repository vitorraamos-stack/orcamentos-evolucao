import { type ChangeEvent, type ClipboardEvent, type DragEvent, useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createOrderEvent } from "@/features/hubos/api";
import {
  uploadLayoutForOrder,
  validateFiles,
  type UploadedLayoutAsset,
} from "@/features/hubos/assets";
import type { OsOrder } from "@/features/hubos/types";

type Props = {
  order: OsOrder | null;
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (order: OsOrder, asset: UploadedLayoutAsset) => Promise<boolean>;
};

/**
 * O handoff só é solicitado depois que o layout foi persistido no R2.
 * Em caso de falha na movimentação, conserva o upload concluído para
 * permitir nova tentativa sem enviar o mesmo arquivo novamente.
 */
export function ArtworkProductionLayoutDialog({
  order,
  userId,
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedLayoutAsset | null>(null);
  const [eventRecorded, setEventRecorded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);

  const changeFile = (files: File[]) => {
    if (busyRef.current || files.length === 0) return;
    if (files.length > 1) {
      toast.warning("Envie apenas um layout final por liberação. O primeiro arquivo foi selecionado.");
    }
    const candidate = files[0];
    const validation = validateFiles([candidate]);
    if (!validation.ok) {
      toast.error(validation.error ?? "Arquivo de layout inválido.");
      return;
    }
    setFile(candidate);
    setUploaded(null);
    setEventRecorded(false);
  };

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    changeFile(Array.from(event.target.files ?? []));
  };

  const onFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    changeFile(Array.from(event.dataTransfer.files));
  };

  const onFilePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!event.clipboardData.files.length) return;
    event.preventDefault();
    changeFile(Array.from(event.clipboardData.files));
  };

  const confirm = async () => {
    if (!order || !file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      let asset = uploaded;
      if (!asset) {
        asset = await uploadLayoutForOrder({ osId: order.id, file, userId });
        setUploaded(asset);
      }
      if (!eventRecorded) {
        await createOrderEvent({
          os_id: order.id,
          type: "layout_uploaded",
          payload: {
            asset_id: asset.id,
            filename: asset.filename,
            object_path: asset.objectPath,
            from_status: order.art_status,
            to_status: "Produzir",
            source: "artwork_board",
          },
          created_by: userId,
        });
        setEventRecorded(true);
      }
      const moved = await onConfirm(order, asset);
      if (moved) onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o layout. A OS permanece na etapa atual."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!busyRef.current) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Liberar arte para Produção</DialogTitle>
          <DialogDescription>
            Anexe o layout final aprovado do pedido para concluir a liberação.
            O arquivo também ficará disponível para a equipe de Instalações.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-semibold">OS {order?.os_number ?? order?.sale_number ?? "—"}</span>
            <span className="ml-2 text-muted-foreground">{order?.client_name}</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label="Selecionar layout final do pedido"
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/20"}`}
            onClick={() => !busy && inputRef.current?.click()}
            onKeyDown={event => {
              if (!busy && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={event => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={onFileDrop}
            onPaste={onFilePaste}
          >
            <FileUp className="mb-2 h-7 w-7 text-primary" />
            <p className="text-sm font-semibold">Clique, arraste ou cole o layout final aqui</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, AI, EPS, CDR, PNG, JPG ou WEBP · até 500 MB
            </p>
            <Input
              ref={inputRef}
              aria-label="Arquivo de layout"
              className="hidden"
              type="file"
              accept=".pdf,.ai,.eps,.cdr,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={onFileInputChange}
            />
          </div>
          {file && (
            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                    {uploaded ? " · Upload concluído" : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remover layout"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setUploaded(null);
                  setEventRecorded(false);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!file || busy} onClick={() => void confirm()}>
            {busy ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando e liberando...</>
            ) : (
              "Enviar layout e liberar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
