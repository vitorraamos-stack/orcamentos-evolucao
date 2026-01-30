import { useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { OsOrder } from '@/features/hubos/types';

type InstallationsInboxProps = {
  orders: OsOrder[];
  selectedId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onEdit: (order: OsOrder) => void;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Sem data';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
};

const getStatusLabel = (order: OsOrder) =>
  order.prod_status ? `Produção • ${order.prod_status}` : `Arte • ${order.art_status}`;

export default function InstallationsInbox({
  orders,
  selectedId,
  searchValue,
  onSearchChange,
  onSelect,
  onBack,
  onEdit,
}: InstallationsInboxProps) {
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const handleCopySummary = async () => {
    if (!selectedOrder) return;
    const summary = [
      `OS ${selectedOrder.sale_number} - ${selectedOrder.client_name}`,
      `Entrega: ${formatDate(selectedOrder.delivery_date)}`,
      `Endereço: ${selectedOrder.address || '(não informado)'}`,
      `Descrição: ${selectedOrder.description || '(sem descrição)'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      toast.success('Resumo copiado para a área de transferência.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível copiar o resumo.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Instalações</h2>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? 'OS' : 'OS'}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-[380px] lg:min-w-[360px] lg:max-w-[420px]">
          <Input
            placeholder="Pesquisar..."
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <div className="flex flex-col gap-2">
            {orders.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhuma OS de instalação encontrada.
              </Card>
            ) : (
              orders.map((order) => {
                const isSelected = order.id === selectedId;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelect(order.id)}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'hover:border-muted-foreground/40 hover:bg-muted/40'
                    )}
                  >
                    <div className="text-sm font-semibold">
                      {order.sale_number} - {order.client_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{getStatusLabel(order)}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {order.delivery_date && (
                        <Badge variant="outline">Entrega: {formatDate(order.delivery_date)}</Badge>
                      )}
                      <Badge>Instalação</Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <Card className="flex-1 p-5">
          {!selectedOrder ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              Selecione uma OS...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">
                  {selectedOrder.sale_number} - {selectedOrder.client_name}
                </h3>
                <p className="text-sm text-muted-foreground">{getStatusLabel(selectedOrder)}</p>
              </div>

              <div className="grid gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Descrição detalhada</p>
                  <p>{selectedOrder.description || '(sem descrição)'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Data de entrega</p>
                  <p>{formatDate(selectedOrder.delivery_date)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Endereço</p>
                  <p>{selectedOrder.address || '(não informado)'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Flags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.reproducao && <Badge variant="secondary">Reprodução</Badge>}
                    {selectedOrder.letra_caixa && <Badge variant="secondary">Letra caixa</Badge>}
                    {!selectedOrder.reproducao && !selectedOrder.letra_caixa && (
                      <span className="text-muted-foreground">(nenhuma)</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onEdit(selectedOrder)}>Editar</Button>
                <Button variant="outline" onClick={handleCopySummary}>
                  Copiar resumo
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
