import { Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WORK_CENTERS,
  WORK_CENTER_LABELS,
  type WorkCenter,
} from "@/modules/production/operations";
import type { BoardAssignee, BoardFiltersState } from "@/shared/kanban/types";
import { countProductionAdvancedFilters } from "../presentation/productionPresentation";

export const clearProductionFilters = (
  value: BoardFiltersState
): BoardFiltersState => ({
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
  workCenter: "all",
  blockedOperations: false,
  myOperations: false,
});

export function ProductionFilters({
  value,
  assignees,
  onChange,
}: {
  value: BoardFiltersState;
  assignees: BoardAssignee[];
  onChange: (value: BoardFiltersState) => void;
}) {
  const set = <K extends keyof BoardFiltersState>(
    key: K,
    next: BoardFiltersState[K]
  ) => onChange({ ...value, [key]: next });
  const count = countProductionAdvancedFilters(value);
  const hasFilters = Boolean(
    value.search ||
    value.mine ||
    count ||
    value.urgent ||
    value.artTag !== "all"
  );
  const assignee = assignees.find(
    item => item.userId === value.assigneeId
  )?.name;
  const chips: [string, () => void][] = [
    ...(assignee
      ? [
          [`Responsável: ${assignee}`, () => set("assigneeId", "all")] as [
            string,
            () => void,
          ],
        ]
      : []),
    ...(value.workCenter !== "all"
      ? [
          [
            `Setor: ${WORK_CENTER_LABELS[value.workCenter]}`,
            () => set("workCenter", "all"),
          ] as [string, () => void],
        ]
      : []),
    ...(
      [
        "overdue",
        "awaitingSupplies",
        "external",
        "reproducao",
        "letraCaixa",
        "blockedOperations",
        "myOperations",
      ] as const
    )
      .filter(key => value[key])
      .map(
        key =>
          [
            {
              overdue: "Atrasadas",
              awaitingSupplies: "Aguardando insumos",
              external: "Produção externa",
              reproducao: "Reprodução",
              letraCaixa: "Letra Caixa",
              blockedOperations: "Bloqueados",
              myOperations: "Minhas operações",
            }[key],
            () => set(key, false),
          ] as [string, () => void]
      ),
  ];
  const checks = [
    ["overdue", "Atrasadas"],
    ["awaitingSupplies", "Aguardando insumos"],
    ["external", "Produção externa"],
    ["reproducao", "Reprodução"],
    ["letraCaixa", "Letra Caixa"],
    ["blockedOperations", "Bloqueados"],
    ["myOperations", "Minhas operações"],
  ] as const;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-full flex-1 sm:min-w-[320px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Buscar OS"
            placeholder="Buscar por OS, venda, cliente ou título..."
            value={value.search}
            onChange={e => set("search", e.target.value)}
          />
        </div>
        <Button
          variant={value.mine ? "secondary" : "outline"}
          aria-pressed={value.mine}
          onClick={() => set("mine", !value.mine)}
        >
          <UserRound className="mr-2 h-4 w-4" />
          Minhas OS
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filtros{count ? ` ${count}` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-w-[calc(100vw-2rem)] w-80 space-y-4"
          >
            <div>
              <label className="mb-1 block text-sm font-medium">
                Responsável
              </label>
              <Select
                value={value.assigneeId}
                onValueChange={next => set("assigneeId", next)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos responsáveis</SelectItem>
                  {assignees.map(a => (
                    <SelectItem key={a.userId} value={a.userId}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Setor</label>
              <Select
                value={value.workCenter}
                onValueChange={next =>
                  set("workCenter", next as "all" | WorkCenter)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os setores</SelectItem>
                  {WORK_CENTERS.map(center => (
                    <SelectItem key={center} value={center}>
                      {WORK_CENTER_LABELS[center]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {checks.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value[key]}
                  onCheckedChange={checked => set(key, Boolean(checked))}
                />
                {label}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => onChange(clearProductionFilters(value))}
          >
            Limpar
          </Button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(([label, remove]) => (
            <Button
              key={label}
              variant="secondary"
              size="sm"
              className="h-7"
              onClick={remove}
            >
              {label}
              <X className="ml-1 h-3 w-3" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
