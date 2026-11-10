import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderItem } from "../types/orderDetail";

type Props = {
  items: OrderItem[];
  itemsLoaded: boolean;
  itemsError: string | null;
  onGoItems: () => void;
  onGoItem: (id: string) => void;
};

/** Summary shows products only; attachments remain available in the Arquivos tab. */
export function OrderSummaryExtras({ items, itemsLoaded, itemsError, onGoItems, onGoItem }: Props) {
  return <div className="min-w-0">
    <Card className="evolu-detail__products-card evolu-detail__section-card min-w-0">
      <CardHeader className="evolu-detail__section-header flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Produtos da OS</CardTitle>
        {itemsLoaded && !itemsError && <span className="text-sm text-muted-foreground">{items.length} item(ns)</span>}
      </CardHeader>
      <CardContent className="space-y-3">
        {itemsError
          ? <p role="status" className="text-sm text-muted-foreground">Lista indisponível. Consulte a aba Itens para tentar novamente.</p>
          : !itemsLoaded
            ? <p role="status" className="text-sm text-muted-foreground">Carregando produtos cadastrados…</p>
            : !items.length
              ? <p className="text-sm text-muted-foreground">Nenhum item estruturado cadastrado.</p>
              : <ol className="divide-y rounded-lg border">{items.slice(0, 5).map(item => <li key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <button type="button" className="min-h-10 break-words text-left text-sm font-semibold hover:underline"
                      onClick={() => onGoItem(item.id)}>{item.name}</button>
                    {item.description && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                </li>)}</ol>}
        {itemsLoaded && !itemsError && items.length > 5 &&
          <p className="text-xs text-muted-foreground">Mais {items.length - 5} produto(s) na lista completa.</p>}
        <Button type="button" className="min-h-11" variant="outline" onClick={onGoItems}>
          Ver todos os itens <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  </div>;
}
