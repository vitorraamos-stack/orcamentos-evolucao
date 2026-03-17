import { useMemo } from "react";
import * as DialogUi from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { OsOrder } from "@/features/hubos/types";

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
  const qrCodeUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        orderNumber
      )}`,
    [orderNumber]
  );

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
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
                OS
              </p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="font-mono text-2xl font-bold leading-none">
                  {orderNumber}
                </p>
                <img
                  src={qrCodeUrl}
                  alt={`QR Code da OS ${orderNumber}`}
                  className="size-20 shrink-0"
                />
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] leading-tight">
                <p className="truncate">
                  <strong>Cliente:</strong> {order.client_name}
                </p>
                {order.title ? (
                  <p className="line-clamp-1">
                    <strong>Título:</strong> {order.title}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogUi.DialogFooter className="no-print gap-2 sm:justify-between">
              <Button type="button" variant="secondary" onClick={onPrintLabel}>
                Imprimir etiqueta
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void onConfirmMove()}
                  disabled={saving}
                >
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
