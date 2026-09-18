import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function OrderSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        aria-label="Buscar ordens de serviço"
        className="pl-9"
        placeholder="Buscar por OS, cliente, título ou descrição"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
