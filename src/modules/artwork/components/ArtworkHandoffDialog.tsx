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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DELIVERY_DEADLINE_PRESET_CONFIG } from "@/features/hubos/deliveryDeadlineConfig";
import type { DeliveryDeadlinePreset } from "@/features/hubos/types";
import type { BoardCardModel } from "@/shared/kanban/types";

export function ArtworkHandoffDialog({
  card,
  preset,
  manualDate,
  onPresetChange,
  onManualDateChange,
  onClose,
  onConfirm,
}: {
  card: BoardCardModel | null;
  preset: DeliveryDeadlinePreset | "";
  manualDate: string;
  onPresetChange: (preset: DeliveryDeadlinePreset) => void;
  onManualDateChange: (date: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(card)} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prazo para Produção</DialogTitle>
          <DialogDescription>
            O handoff inicia Produção e persiste o preset e o prazo no banco.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={preset}
          onValueChange={value =>
            onPresetChange(value as DeliveryDeadlinePreset)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o prazo" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DELIVERY_DEADLINE_PRESET_CONFIG).map(
              ([value, config]) => (
                <SelectItem key={value} value={value}>
                  {config.label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        {preset === "CUSTOM" && (
          <Input
            type="date"
            value={manualDate}
            onChange={event => onManualDateChange(event.target.value)}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!preset} onClick={onConfirm}>
            Enviar para Produção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
