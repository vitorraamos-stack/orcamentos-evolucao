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
import type { ProductionTag } from "@/features/hubos/types";
import type { BoardCardModel } from "@/shared/kanban/types";

export function ProductionTagDialog({
  card,
  tag,
  details,
  onTagChange,
  onDetailsChange,
  onClose,
  onSave,
}: {
  card: BoardCardModel | null;
  tag: ProductionTag;
  details: string;
  onTagChange: (tag: ProductionTag) => void;
  onDetailsChange: (details: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const resolving =
    card?.order.production_tag === "AGUARDANDO_INSUMOS" &&
    tag === "EM_PRODUCAO";
  return (
    <Dialog open={Boolean(card)} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tag de Produção</DialogTitle>
          <DialogDescription>
            A etapa não é alterada por esta condição operacional.
          </DialogDescription>
        </DialogHeader>
        <Select
          value={tag}
          onValueChange={value => onTagChange(value as ProductionTag)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EM_PRODUCAO">Em produção</SelectItem>
            <SelectItem value="AGUARDANDO_INSUMOS">
              Aguardando insumos
            </SelectItem>
            <SelectItem value="PRODUCAO_EXTERNA">Produção externa</SelectItem>
            <SelectItem value="PRONTO">Pronto</SelectItem>
          </SelectContent>
        </Select>
        {(tag === "AGUARDANDO_INSUMOS" || resolving) && (
          <Input
            placeholder={
              tag === "AGUARDANDO_INSUMOS"
                ? "Qual material está faltando?"
                : "Como o insumo foi resolvido?"
            }
            value={details}
            onChange={event => onDetailsChange(event.target.value)}
          />
        )}
        <DialogFooter>
          <Button onClick={onSave}>Salvar tag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
