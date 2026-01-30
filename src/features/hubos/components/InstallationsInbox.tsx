import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PROD_COLUMNS } from '@/features/hubos/constants';
import { cn } from '@/lib/utils';
import type { OsOrder } from '@/features/hubos/types';

type InstallationsInboxProps = {
  orders: OsOrder[];
  selectedId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string | null) => void;
  onBack: () => void;
  onEdit: (order: OsOrder) => void;
  onOpenKanban: (order: OsOrder) => void;
};

type QuickFilter = 'today' | 'week' | 'overdue' | 'all';

const formatDate = (value: string | null) => {
  if (!value) return 'Sem data';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
};

const getStatusLabel = (order: OsOrder) =>
  order.prod_status ? `Produção • ${order.prod_status}` : `Arte • ${order.art_status}`;

const FINAL_PROD_STATUS = PROD_COLUMNS[PROD_COLUMNS.length - 1];

const normalize = (value: string) => value.toLowerCase();

const parseDeliveryDate = (value: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isFinalized = (order: OsOrder) => order.prod_status === FINAL_PROD_STATUS;

export default function InstallationsInbox({
  orders,
  selectedId,
  searchValue,
  onSearchChange,
  onSelect,
  onBack,
  onEdit,
  onOpenKanban,
}: InstallationsInboxProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const weekLimit = useMemo(() => {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 7);
    return limit;
  }, [today]);

  const searchFilteredOrders = useMemo(() => {
    const search = normalize(searchValue.trim());
    return orders.filter((order) => {
      if (!search) return true;
      const description = order.description ?? '';
      return (
        normalize(order.sale_number).includes(search) ||
        normalize(order.client_name).includes(search) ||
        normalize(description).includes(search)
      );
    });
  }, [orders, searchValue]);

  const getIsToday = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery.getTime() === today.getTime();
    },
    [today]
  );

  const getIsOverdue = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery < today && !isFinalized(order);
    },
    [today]
  );

  const getIsWeek = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery >= today && delivery <= weekLimit;
    },
    [today, weekLimit]
  );

  const quickFilterCounts = useMemo(
    () => ({
      today: searchFilteredOrders.filter(getIsToday).length,
      week: searchFilteredOrders.filter(getIsWeek).length,
      overdue: searchFilteredOrders.filter(getIsOverdue).length,
      all: searchFilteredOrders.length,
    }),
    [getIsOverdue, getIsToday, getIsWeek, searchFilteredOrders]
  );

  const filteredOrders = useMemo(() => {
    const filtered = searchFilteredOrders.filter((order) => {
      if (quickFilter === 'today') return getIsToday(order);
      if (quickFilter === 'week') return getIsWeek(order);
      if (quickFilter === 'overdue') return getIsOverdue(order);
      return true;
    });
    return filtered.sort((a, b) => {
      const overdueA = getIsOverdue(a);
      const overdueB = getIsOverdue(b);
      if (overdueA !== overdueB) return overdueA ? -1 : 1;

      const dateA = parseDeliveryDate(a.delivery_date);
      const dateB = parseDeliveryDate(b.delivery_date);
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }

      const updatedA = new Date(a.updated_at).getTime();
      const updatedB = new Date(b.updated_at).getTime();
      return updatedB - updatedA;
    });
  }, [getIsOverdue, getIsToday, getIsWeek, quickFilter, searchFilteredOrders]);

  useEffect(() => {
    if (!filteredOrders.length) {
      if (selectedId !== null) {
        onSelect(null);
      }
      return;
    }
    const stillExists = filteredOrders.some((order) => order.id === selectedId);
    if (!selectedId || !stillExists) {
      onSelect(filteredOrders[0].id);
    }
  }, [filteredOrders, onSelect, selectedId]);

  const handleCopySummary = async () => {
    if (!selectedOrder) return;
    const summary = [
      `OS ${selectedOrder.sale_number} - ${selectedOrder.client_name}`,
      `Entrega: ${formatDate(selectedOrder.delivery_date)}`,
      `Endereço: ${selectedOrder.address || '(não informado)'}`,
      `Status: ${getStatusLabel(selectedOrder)}`,
      `Pedido: ${selectedOrder.description || '(sem descrição)'}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      toast.success('Resumo copiado para a área de transferência.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível copiar o resumo.');
    }
  };

  const handleCopyAddress = async () => {
    if (!selectedOrder) return;
    if (!selectedOrder.address) {
      toast.error('Sem endereço para copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedOrder.address);
      toast.success('Endereço copiado para a área de transferência.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível copiar o endereço.');
    }
  };

  const handleOpenWhatsapp = () => {
    if (!selectedOrder) return;
    const summary = `Instalação OS ${selectedOrder.sale_number} - ${selectedOrder.client_name} | Entrega: ${formatDate(
      selectedOrder.delivery_date
    )} | Endereço: ${selectedOrder.address || '(não informado)'}`;
    const url = `https://wa.me/?text=${encodeURIComponent(summary)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('Abrindo WhatsApp...');
  };

  const handleOpenKanban = () => {
    if (!selectedOrder) return;
    onOpenKanban(selectedOrder);
  };

  const filteredCountLabel = `${filteredOrders.length}/${orders.length}`;
  const hasOrders = orders.length > 0;
  const hasFiltered = filteredOrders.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Instalações ({filteredCountLabel})</h2>
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={quickFilter === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setQuickFilter('today')}
            >
              Hoje ({quickFilterCounts.today})
            </Button>
            <Button
              type="button"
              variant={quickFilter === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setQuickFilter('week')}
            >
              Esta semana ({quickFilterCounts.week})
            </Button>
            <Button
              type="button"
              variant={quickFilter === 'overdue' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setQuickFilter('overdue')}
            >
              Atrasadas ({quickFilterCounts.overdue})
            </Button>
            <Button
              type="button"
              variant={quickFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setQuickFilter('all')}
            >
              Todas ({quickFilterCounts.all})
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {!hasOrders ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhuma OS marcada como Instalação.
              </Card>
            ) : !hasFiltered ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhum resultado para sua busca.
              </Card>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = order.id === selectedId;
                const isOverdue = getIsOverdue(order);
                const isToday = getIsToday(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelect(order.id)}
                    className={cn(
                      'flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition',
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'hover:border-muted-foreground/40 hover:bg-muted/40',
                      isOverdue && 'border-l-4 border-l-destructive'
                    )}
                  >
                    <div className="text-sm font-semibold">
                      {order.sale_number} - {order.client_name}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{getStatusLabel(order)}</Badge>
                      {isOverdue && <Badge variant="destructive">ATRASADA</Badge>}
                      {isToday && <Badge>HOJE</Badge>}
                    </div>
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
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{getStatusLabel(selectedOrder)}</Badge>
                  {getIsOverdue(selectedOrder) && <Badge variant="destructive">ATRASADA</Badge>}
                  {getIsToday(selectedOrder) && <Badge>HOJE</Badge>}
                </div>
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
                <Button variant="outline" onClick={handleOpenKanban}>
                  Abrir no Kanban
                </Button>
                <Button variant="outline" onClick={handleCopySummary}>
                  Copiar resumo
                </Button>
                <Button variant="outline" onClick={handleCopyAddress}>
                  Copiar endereço
                </Button>
                <Button variant="outline" onClick={handleOpenWhatsapp}>
                  Abrir WhatsApp
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
