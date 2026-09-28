import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  Installation,
  InstallationScheduleInput,
  InstallationTeam,
  LogisticsOrder,
} from "../types";
export function InstallationScheduleDialog({
  order,
  installation,
  teams,
  open,
  onOpenChange,
  onSave,
}: {
  order?: LogisticsOrder | null;
  installation?: Installation | null;
  teams: InstallationTeam[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (i: InstallationScheduleInput) => Promise<void>;
}) {
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("120");
  const [team, setTeam] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setStart(installation?.scheduled_start?.slice(0, 16) ?? "");
      setTeam(installation?.team_id ?? "");
      setVehicle(installation?.vehicle_label ?? "");
      setNotes(installation?.notes ?? "");
    }
  }, [open, installation]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {installation ? "Reagendar instalação" : "Agendar instalação"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Data e hora *</Label>
            <Input
              type="datetime-local"
              value={start}
              onChange={e => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Duração estimada (min)</Label>
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={e => setDuration(e.target.value)}
            />
          </div>
          <div>
            <Label>Equipe</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={team}
              onChange={e => {
                setTeam(e.target.value);
                const t = teams.find(x => x.id === e.target.value);
                if (t?.default_vehicle_label && !vehicle)
                  setVehicle(t.default_vehicle_label);
              }}
            >
              <option value="">Sem equipe</option>
              {teams
                .filter(t => t.active)
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Veículo</Label>
            <Input value={vehicle} onChange={e => setVehicle(e.target.value)} />
          </div>
          <div>
            <Label>Endereço (snapshot da OS)</Label>
            <Input
              disabled
              value={
                order?.address ??
                installation?.address_snapshot ??
                "Não informado"
              }
            />
            {!order?.address && !installation?.address_snapshot && (
              <p className="text-xs text-amber-600">
                Sem endereço: a rota ficará indisponível.
              </p>
            )}
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <Button
            disabled={!start || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({
                  osId: order?.id ?? installation!.os_id,
                  scheduledStart: new Date(start).toISOString(),
                  teamId: team || null,
                  estimatedDurationMinutes: Number(duration) || null,
                  vehicleLabel: vehicle || null,
                  notes: notes || null,
                });
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Salvando…" : "Salvar agendamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
