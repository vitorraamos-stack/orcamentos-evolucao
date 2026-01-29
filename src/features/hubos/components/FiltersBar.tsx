import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.reproducao}
          onCheckedChange={(checked) => onChange({ ...value, reproducao: Boolean(checked) })}
        />
        <Label>Reprodução</Label>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.letraCaixa}
          onCheckedChange={(checked) => onChange({ ...value, letraCaixa: Boolean(checked) })}
        />
        <Label>Letra Caixa</Label>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.overdueOnly}
          onCheckedChange={(checked) => onChange({ ...value, overdueOnly: Boolean(checked) })}
        />
        <Label>Somente atrasados</Label>
      </label>
    </div>
  );
}
