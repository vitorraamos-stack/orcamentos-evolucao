import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HubOsFilters } from '../types';
import { LOGISTIC_OPTIONS } from '../constants';

interface FiltersBarProps {
  value: HubOsFilters;
  onChange: (next: HubOsFilters) => void;
}

export default function FiltersBar({ value, onChange }: FiltersBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-[220px] flex-1">
        <Input
          placeholder="Buscar por nº venda ou cliente"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </div>
      <Select
        value={value.logisticType}
        onValueChange={(val) => onChange({ ...value, logisticType: val as HubOsFilters['logisticType'] })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Logística" />
        </SelectTrigger>
        <SelectContent>
          {LOGISTIC_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
