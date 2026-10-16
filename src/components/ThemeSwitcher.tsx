import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemePreference } from "@/contexts/themePreference";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const choices: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Automático", Icon: Monitor },
];

export default function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme, switchable } = useTheme();
  if (!switchable) return null;
  const chosen = choices.find(choice => choice.value === theme) ?? choices[0];
  const ActiveIcon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="evolu-shell__theme-trigger mb-2 flex w-full items-center justify-between gap-2 px-2"
          aria-label={`Aparência: ${chosen.label}. Alterar tema`}
        >
          <span className="flex items-center gap-2 text-sm">
            <ActiveIcon className="h-4 w-4" aria-hidden="true" />
            Aparência
          </span>
          <span className="flex items-center gap-1 text-xs opacity-75">
            {chosen.label}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-48">
        <DropdownMenuLabel>Aparência do EvoluSystem</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={value => setTheme(value as ThemePreference)}>
          {choices.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
