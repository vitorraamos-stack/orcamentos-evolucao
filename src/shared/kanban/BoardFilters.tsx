import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardAssignee, BoardFiltersState, BoardKind } from "./types";

export function BoardFilters({
  board,
  value,
  assignees,
  onChange,
}: {
  board: BoardKind;
  value: BoardFiltersState;
  assignees: BoardAssignee[];
  onChange: (value: BoardFiltersState) => void;
}) {
  const set = <K extends keyof BoardFiltersState>(
    key: K,
    next: BoardFiltersState[K]
  ) => onChange({ ...value, [key]: next });
  const checks: [keyof BoardFiltersState, string][] =
    board === "art"
      ? [
          ["mine", "Minhas OS"],
          ["urgent", "Urgentes"],
          ["overdue", "Atrasadas"],
        ]
      : [
          ["mine", "Minhas OS"],
          ["overdue", "Atrasadas"],
          ["awaitingSupplies", "Aguardando insumos"],
          ["external", "Produção externa"],
          ["reproducao", "Reprodução"],
          ["letraCaixa", "Letra Caixa"],
        ];
  return (
    <details className="rounded-lg border bg-card p-3" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium md:hidden">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-3 md:mt-0">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Buscar por OS, venda, cliente ou título"
          value={value.search}
          onChange={event => set("search", event.target.value)}
        />
        <Select
          value={value.assigneeId}
          onValueChange={next => set("assigneeId", next)}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos responsáveis</SelectItem>
            {assignees.map(user => (
              <SelectItem key={user.userId} value={user.userId}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {board === "art" && (
          <Select
            value={value.artTag}
            onValueChange={next => set("artTag", next)}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Tipo de arte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="ARTE_PRONTA_EDICAO">
                Arte Pronta / Editar
              </SelectItem>
              <SelectItem value="CRIACAO_ARTE">Criar Arte</SelectItem>
              <SelectItem value="URGENTE">Urgente</SelectItem>
            </SelectContent>
          </Select>
        )}
        {checks.map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 whitespace-nowrap text-sm"
          >
            <Checkbox
              checked={Boolean(value[key])}
              onCheckedChange={checked => set(key, Boolean(checked) as never)}
            />
            {label}
          </label>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...value,
              search: "",
              mine: false,
              overdue: false,
              urgent: false,
              assigneeId: "all",
              artTag: "all",
              awaitingSupplies: false,
              external: false,
              reproducao: false,
              letraCaixa: false,
            })
          }
        >
          Limpar
        </Button>
      </div>
    </details>
  );
}
