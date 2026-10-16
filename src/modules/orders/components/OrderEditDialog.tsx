import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OsOrder } from "@/features/hubos/types";
export type OrderEditInput = Pick<
  OsOrder,
  | "title"
  | "description"
  | "delivery_date"
  | "logistic_type"
  | "address"
  | "art_direction_tag"
  | "is_urgent"
>;
export function OrderEditDialog({
  order,
  open,
  onOpenChange,
  onSave,
}: {
  order: OsOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: OrderEditInput, expectedUpdatedAt: string) => Promise<void>;
}) {
  const [value, setValue] = useState<OrderEditInput>({
    title: order.title,
    description: order.description,
    delivery_date: order.delivery_date,
    logistic_type: order.logistic_type,
    address: order.address,
    art_direction_tag: order.art_direction_tag,
    is_urgent: order.is_urgent,
  });
  const [saving, setSaving] = useState(false);
  const [openedUpdatedAt, setOpenedUpdatedAt] = useState(order.updated_at);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(
    () => {
      if (!open) return;
      // Freeze the server revision when this editing session opens; a
      // background refresh must not silently replace the user's draft.
      setOpenedUpdatedAt(order.updated_at);
      setSaveError(null);
      setValue({
        title: order.title,
        description: order.description,
        delivery_date: order.delivery_date,
        logistic_type: order.logistic_type,
        address: order.address,
        art_direction_tag: order.art_direction_tag,
        is_urgent: order.is_urgent,
      });
    },
    // Updating the OS object while the modal stays open must preserve the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, order.id]
  );
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!saving) onOpenChange(nextOpen); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar dados operacionais</DialogTitle>
          <DialogDescription>
            Atualize as informações da OS. As alterações só serão enviadas ao salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <section aria-labelledby="edit-os-servico" className="space-y-3 rounded-xl border bg-muted/10 p-4">
            <h3 id="edit-os-servico" className="text-sm font-semibold">Serviço e briefing</h3>
          <div className="space-y-1.5">
            <Label htmlFor="order-title">Título</Label>
            <Input
              id="order-title"
              value={value.title ?? ""}
              onChange={e =>
                setValue(v => ({ ...v, title: e.target.value || null }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-description">Descrição</Label>
            <Textarea
              id="order-description"
              value={value.description ?? ""}
              onChange={e =>
                setValue(v => ({ ...v, description: e.target.value || null }))
              }
            />
          </div>
          </section>
          <section aria-labelledby="edit-os-prazo-logistica" className="space-y-3 rounded-xl border bg-muted/10 p-4">
            <h3 id="edit-os-prazo-logistica" className="text-sm font-semibold">Prazo e logística</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-deadline">Prazo final</Label>
              <Input
                id="order-deadline"
                type="date"
                value={value.delivery_date ?? ""}
                onChange={e =>
                  setValue(v => ({
                    ...v,
                    delivery_date: e.target.value || null,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-logistics">Logística</Label>
              <Select
                value={value.logistic_type}
                onValueChange={logistic_type =>
                  setValue(v => ({
                    ...v,
                    logistic_type: logistic_type as OsOrder["logistic_type"],
                  }))
                }
              >
                <SelectTrigger id="order-logistics" aria-label="Logística">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retirada">Retirada</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-address">Endereço</Label>
            <Input
              id="order-address"
              value={value.address ?? ""}
              onChange={e =>
                setValue(v => ({ ...v, address: e.target.value || null }))
              }
            />
          </div>
          </section>
          <section aria-labelledby="edit-os-prioridade" className="space-y-3 rounded-xl border bg-muted/10 p-4">
            <h3 id="edit-os-prioridade" className="text-sm font-semibold">Prioridade</h3>
          <div className="space-y-1.5">
            <Label htmlFor="order-priority">Classificação</Label>
            <Select
              value={value.is_urgent ? "URGENTE" : "NORMAL"}
              onValueChange={priority =>
                setValue(v => ({ ...v, is_urgent: priority === "URGENTE" }))
              }
            >
              <SelectTrigger id="order-priority" aria-label="Classificação da prioridade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="URGENTE">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          </section>
        </div>
        {saveError && (
          <p role="alert" className="break-words text-sm text-destructive">
            {saveError}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                setSaveError(null);
                await onSave(value, openedUpdatedAt);
                onOpenChange(false);
              } catch (error) {
                // The user must retain the current text if the revision changed.
                setSaveError(error instanceof Error ? error.message : "Não foi possível salvar a OS. Suas alterações foram preservadas.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
