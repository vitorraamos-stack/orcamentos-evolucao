import { useEffect, useMemo, useState } from "react";
import * as DialogUi from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OsOrder } from "@/features/hubos/types";
import { generateQrCodeDataUrl } from "@/features/hubos/utils/qrCode";

type AcabamentoLabelDialogProps = {
  open: boolean;
  order: OsOrder | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmMove: () => Promise<void>;
  onPrintLabel: () => void;
};

const getOrderNumber = (order: OsOrder | null) => {
  if (!order) return "";
  return order.os_number?.toString() || order.sale_number;
};

export default function AcabamentoLabelDialog({
  open,
  order,
  saving,
  onOpenChange,
  onConfirmMove,
  onPrintLabel,
}: AcabamentoLabelDialogProps) {
  const orderNumber = useMemo(() => getOrderNumber(order), [order]);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrCodeError, setQrCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderNumber) {
      setQrCodeDataUrl(null);
      setQrCodeError(null);
      return;
    }

    let cancelled = false;
    setQrCodeDataUrl(null);
    setQrCodeError(null);

    void generateQrCodeDataUrl(orderNumber)
      .then((dataUrl) => {
        if (cancelled) return;
        setQrCodeDataUrl(dataUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Falha ao gerar QR Code da etiqueta de acabamento", error);
        setQrCodeError("QR Code indisponível. Tente reabrir a etiqueta.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, orderNumber]);

  const canPrint = Boolean(qrCodeDataUrl) && !qrCodeError;

  return (
    <DialogUi.Dialog open={open} onOpenChange={onOpenChange}>
      <DialogUi.DialogContent className="max-w-md">
        <DialogUi.DialogHeader>
          <DialogUi.DialogTitle>Etiqueta para acabamento</DialogUi.DialogTitle>
          <DialogUi.DialogDescription>
            Imprima a etiqueta e confirme para mover a OS para Em Acabamento.
          </DialogUi.DialogDescription>
        </DialogUi.DialogHeader>

        {order ? (
          <div className="space-y-4">
            <div
              id="print-label-area"
              className="thermal-print-label rounded-md border bg-white p-3 text-black"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">OS</p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="font-mono text-2xl font-bold leading-none">{orderNumber}</p>
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt={`QR Code da OS ${orderNumber}`}
                    className="size-20 shrink-0"
                  />
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center rounded border border-slate-300 text-[10px] text-slate-500">
                    Gerando QR...
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] leading-tight">
                <p className="truncate"><strong>Cliente:</strong> {order.client_name}</p>
                {order.title ? (
                  <p className="line-clamp-1"><strong>Título:</strong> {order.title}</p>
                ) : null}
              </div>
              {qrCodeError ? <p className="mt-1 text-[10px] text-red-600">{qrCodeError}</p> : null}
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] leading-tight text-amber-900">
              Na tela de impressão, desative Cabeçalhos e rodapés, use Margens:
              nenhuma e Escala: 100%.
            </p>

            <DialogUi.DialogFooter className="no-print gap-2 sm:justify-between">
              <Button type="button" variant="secondary" onClick={onPrintLabel} disabled={!canPrint || saving}>
                Imprimir etiqueta
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void onConfirmMove()} disabled={saving}>
                  {saving ? "Movendo..." : "Confirmar e mover"}
                </Button>
              </div>
            </DialogUi.DialogFooter>
          </div>
        ) : null}
      </DialogUi.DialogContent>
    </DialogUi.Dialog>
  );
}
