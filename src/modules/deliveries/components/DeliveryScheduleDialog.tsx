import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LogisticsOrder } from "@/modules/installations/types";
import type { Delivery, DeliveryInput, DeliveryMode } from "../types";
import { fromSaoPauloDateTimeLocal, toSaoPauloDateTimeLocal } from "@/shared/lib/saoPauloTime";
export function DeliveryScheduleDialog({
  order,
  delivery,
  profiles,
  open,
  onOpenChange,
  onSave,
}: {
  order: LogisticsOrder | null; delivery?: Delivery | null;
  profiles: Array<{ id: string; name?: string | null; email?: string | null }>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (i: DeliveryInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<DeliveryMode>("OWN_DELIVERY");
  const [date, setDate] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [assigned, setAssigned] = useState(""); const [vehicle, setVehicle] = useState(""); const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; setMode(delivery?.mode ?? "OWN_DELIVERY"); setDate(delivery?.scheduled_at ? toSaoPauloDateTimeLocal(delivery.scheduled_at) : ""); setCarrier(delivery?.carrier_name ?? ""); setTracking(delivery?.tracking_code ?? ""); setAssigned(delivery?.assigned_to ?? ""); setVehicle(delivery?.vehicle_label ?? ""); setNotes(delivery?.notes ?? ""); }, [open, delivery]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{delivery ? "Editar detalhes da entrega" : "Agendar entrega"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Modalidade</Label>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={mode}
              disabled={Boolean(delivery)}
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
          {mode === "OWN_DELIVERY" && <><div><Label>Responsável</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={assigned} onChange={e => setAssigned(e.target.value)}><option value="">Não definido</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}</select></div><div><Label>Veículo</Label><Input value={vehicle} onChange={e => setVehicle(e.target.value)} /></div></>}
          <div><Label>Observações</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <Button
            disabled={busy || (!order && !delivery)}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({
                  osId: order?.id ?? delivery!.os_id,
                  mode,
                  scheduledAt: date ? fromSaoPauloDateTimeLocal(date) : null,
                  assignedTo: mode === "OWN_DELIVERY" ? assigned || null : null,
                  vehicleLabel: mode === "OWN_DELIVERY" ? vehicle || null : null,
                  carrierName: carrier || null,
                  trackingCode: tracking || null,
                  notes: notes || null,
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
