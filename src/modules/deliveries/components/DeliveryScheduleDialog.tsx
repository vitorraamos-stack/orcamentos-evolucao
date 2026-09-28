import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LogisticsOrder } from "@/modules/installations/types";
import type { DeliveryInput, DeliveryMode } from "../types";
export function DeliveryScheduleDialog({
  order,
  open,
  onOpenChange,
  onSave,
}: {
  order: LogisticsOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (i: DeliveryInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<DeliveryMode>("OWN_DELIVERY");
  const [date, setDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar entrega</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Modalidade</Label>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={mode}
              onChange={e => setMode(e.target.value as DeliveryMode)}
            >
              <option value="OWN_DELIVERY">Entrega própria</option>
              <option value="CARRIER">Transportadora</option>
            </select>
          </div>
          <div>
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          {mode === "CARRIER" && (
            <>
              <div>
                <Label>Transportadora</Label>
                <Input
                  value={carrier}
                  onChange={e => setCarrier(e.target.value)}
                />
              </div>
              <div>
                <Label>Rastreio</Label>
                <Input
                  value={tracking}
                  onChange={e => setTracking(e.target.value)}
                />
              </div>
            </>
          )}
          <Button
            disabled={busy || !order}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({
                  osId: order!.id,
                  mode,
                  scheduledAt: date ? new Date(date).toISOString() : null,
                  carrierName: carrier || null,
                  trackingCode: tracking || null,
                });
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar entrega
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
