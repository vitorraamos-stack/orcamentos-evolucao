import { Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BoardAssignee, BoardFiltersState } from "@/shared/kanban/types";
import { countArtworkAdvancedFilters } from "../presentation/artworkPresentation";

export const clearArtworkFilters = (value: BoardFiltersState): BoardFiltersState => ({
  ...value, search: "", mine: false, urgent: false, overdue: false, assigneeId: "all", artTag: "all",
});

export function ArtworkFilters({ value, assignees, onChange }: { value: BoardFiltersState; assignees: BoardAssignee[]; onChange: (value: BoardFiltersState) => void }) {
  const set = <K extends keyof BoardFiltersState>(key: K, next: BoardFiltersState[K]) => onChange({ ...value, [key]: next });
  const count = countArtworkAdvancedFilters(value);
  const hasFilters = Boolean(value.search || value.mine || count);
  const assignee = assignees.find(item => item.userId === value.assigneeId)?.name;
  const chips: [string, () => void][] = [
    ...(assignee ? [[`Responsável: ${assignee}`, () => set("assigneeId", "all")] as [string, () => void]] : []),
    ...(value.artTag !== "all" ? [[value.artTag === "CRIACAO_ARTE" ? "Criar arte" : "Arte pronta / Editar", () => set("artTag", "all")] as [string, () => void]] : []),
    ...(value.urgent ? [["Urgentes", () => set("urgent", false)] as [string, () => void]] : []),
    ...(value.overdue ? [["Atrasadas", () => set("overdue", false)] as [string, () => void]] : []),
  ];
  return <div className="space-y-2 rounded-xl border bg-card p-3">
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-full flex-1 sm:min-w-[320px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" aria-label="Buscar OS" placeholder="Buscar por OS, venda, cliente ou título..." value={value.search} onChange={e => set("search", e.target.value)}/></div>
      <Button variant={value.mine ? "secondary" : "outline"} aria-pressed={value.mine} onClick={() => set("mine", !value.mine)}><UserRound className="mr-2 h-4 w-4"/>Minhas OS</Button>
      <Popover><PopoverTrigger asChild><Button variant="outline"><SlidersHorizontal className="mr-2 h-4 w-4"/>Filtros{count ? ` ${count}` : ""}</Button></PopoverTrigger><PopoverContent align="end" className="w-80 space-y-4">
        <div><label className="mb-1 block text-sm font-medium">Responsável</label><Select value={value.assigneeId} onValueChange={next => set("assigneeId", next)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos responsáveis</SelectItem>{assignees.map(a => <SelectItem key={a.userId} value={a.userId}>{a.name}</SelectItem>)}</SelectContent></Select></div>
        <div><label className="mb-1 block text-sm font-medium">Tipo de arte</label><Select value={value.artTag} onValueChange={next => set("artTag", next)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="ARTE_PRONTA_EDICAO">Arte pronta / Editar</SelectItem><SelectItem value="CRIACAO_ARTE">Criar arte</SelectItem></SelectContent></Select></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.urgent} onCheckedChange={checked => set("urgent", Boolean(checked))}/>Urgentes</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={value.overdue} onCheckedChange={checked => set("overdue", Boolean(checked))}/>Atrasadas</label>
      </PopoverContent></Popover>
      {hasFilters && <Button variant="ghost" onClick={() => onChange(clearArtworkFilters(value))}>Limpar</Button>}
    </div>
    {chips.length > 0 && <div className="flex flex-wrap gap-2">{chips.map(([label, remove]) => <Button key={label} variant="secondary" size="sm" className="h-7" onClick={remove}>{label}<X className="ml-1 h-3 w-3"/></Button>)}</div>}
  </div>;
}
