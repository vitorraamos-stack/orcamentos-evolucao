import { Clock3, Factory, Files, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";

export type OrderDetailShortcutTab = "items" | "production" | "files";

type Props = {
  onOpenTab: (tab: OrderDetailShortcutTab) => void;
  onOpenManagement: () => void;
};

/** Presentation-only navigation: existing tabs keep responsibility for loading their data. */
export function OrderDetailShortcuts({ onOpenTab, onOpenManagement }: Props) {
  return (
    <nav aria-label="Acessos rápidos da Ordem de Serviço" className="evolu-detail__shortcuts">
      <div className="evolu-detail__shortcuts-intro">
        <div>
          <h2>Acesso rápido</h2>
          <p>Vá direto às informações que precisa consultar.</p>
        </div>
      </div>
      <div className="evolu-detail__shortcuts-grid">
        <Button type="button" variant="outline" className="evolu-detail__shortcut" onClick={() => onOpenTab("items")}>
          <ListChecks aria-hidden="true" className="size-4 shrink-0" />
          <span>Itens do pedido</span>
        </Button>
        <Button type="button" variant="outline" className="evolu-detail__shortcut evolu-detail__shortcut--accent" onClick={() => onOpenTab("production")}>
          <Factory aria-hidden="true" className="size-4 shrink-0" />
          <span>Produção</span>
        </Button>
        <Button type="button" variant="outline" className="evolu-detail__shortcut" onClick={() => onOpenTab("files")}>
          <Files aria-hidden="true" className="size-4 shrink-0" />
          <span>Arquivos</span>
        </Button>
        <Button type="button" variant="outline" className="evolu-detail__shortcut" onClick={onOpenManagement}>
          <Clock3 aria-hidden="true" className="size-4 shrink-0" />
          <span>Responsáveis e prazos</span>
        </Button>
      </div>
    </nav>
  );
}
