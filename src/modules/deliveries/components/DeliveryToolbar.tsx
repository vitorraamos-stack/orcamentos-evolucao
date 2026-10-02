import type { ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DeliveryToolbar({
  query,
  onQueryChange,
  placeholder,
  filters,
  activeFilterCount = 0,
  onClear,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  filters?: ReactNode;
  activeFilterCount?: number;
  onClear?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {children}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontal className="mr-2 size-4" />
            Filtros{activeFilterCount ? ` ${activeFilterCount}` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          {filters ?? (
            <p className="text-sm text-muted-foreground">
              Nenhum filtro adicional.
            </p>
          )}
          {activeFilterCount > 0 && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="mr-2 size-4" />
              Limpar filtros
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
