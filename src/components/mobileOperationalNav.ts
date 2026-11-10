import { getOperationalNavState } from "./operationalNavState";

export type MobileShortcutId =
  | "orders"
  | "art"
  | "production"
  | "installations"
  | "deliveries"
  | "estimator"
  | "dashboard"
  | "printing"
  | "library"
  | "calculator"
  | "gallery"
  | "finance";

export type MobileShortcutAccess = Record<MobileShortcutId, boolean>;

const SHORTCUTS: ReadonlyArray<{ id: MobileShortcutId; href: string; label: string }> = [
  { id: "orders", href: "/os", label: "OS" },
  { id: "art", href: "/os/arte", label: "Arte" },
  { id: "production", href: "/os/producao", label: "Produção" },
  { id: "installations", href: "/instalacoes", label: "Instalações" },
  { id: "deliveries", href: "/entregas", label: "Entregas" },
  { id: "estimator", href: "/orcamentista", label: "Orçamentos" },
  { id: "dashboard", href: "/hub-os", label: "Dashboard" },
  { id: "printing", href: "/impressao-estoque", label: "Impressão" },
  { id: "library", href: "/biblioteca", label: "Biblioteca" },
  { id: "calculator", href: "/calculadora", label: "Calculadora" },
  { id: "gallery", href: "/galeria", label: "Galeria" },
  { id: "finance", href: "/hub-os/financeiro", label: "Financeiro" },
];

/**
 * Apresentação somente: nunca amplia autorizações nem substitui os guards de rota.
 * A barra mostra no máximo 4 atalhos; o menu lateral dá acesso aos demais módulos.
 */
export function getMobileShortcuts(access: MobileShortcutAccess) {
  return SHORTCUTS.filter(shortcut => access[shortcut.id]).slice(0, 4);
}

export function isMobileShortcutActive(id: MobileShortcutId, location: string): boolean {
  const nav = getOperationalNavState(location);
  switch (id) {
    case "orders": return nav.orders;
    case "art": return nav.art;
    case "production": return nav.production;
    case "installations": return location === "/instalacoes" || location.startsWith("/instalacoes/");
    case "deliveries": return location === "/entregas" || location.startsWith("/entregas/");
    case "estimator": return location === "/orcamentista" || location.startsWith("/orcamentista/");
    case "dashboard": return location === "/hub-os";
    case "printing": return location === "/impressao-estoque" || location.startsWith("/impressao-estoque/");
    case "library": return location === "/biblioteca" || location.startsWith("/biblioteca/");
    case "calculator": return location === "/calculadora";
    case "gallery": return location === "/galeria";
    case "finance": return location === "/hub-os/financeiro" || location === "/financeiro";
  }
}
