import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchOsList, updateOs, createOsEvent } from '../api';
import type { Os } from '../types';
import { ARTE_STATUSES, PRODUCAO_STATUSES } from '../statuses';
import { useAuth } from '@/contexts/AuthContext';

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function OsArteBoardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Os[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const osData = await fetchOsList();
      setOrders(osData);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar o quadro de Arte.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const ordersByStatus = useMemo(() => {
    const map = new Map<string, Os[]>();
    ARTE_STATUSES.forEach((status) => map.set(status, []));
    orders.forEach((order) => {
      const statusValue = order.status_arte ?? ARTE_STATUSES[0];
      if (!map.has(statusValue)) {
        map.set(statusValue, []);
      }
      map.get(statusValue)?.push(order);
    });
    return map;
  }, [orders]);

  const handleMove = async (order: Os, nextStatus: string) => {
    try {
      const updated = await updateOs(order.id, {
        status_arte: nextStatus,
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: 'status_arte_changed',
        payload: { from: order.status_arte, to: nextStatus },
        created_by: user?.id ?? null,
      });
      setOrders((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
      toast.success('Status atualizado.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao mover a OS.');
    }
  };

  const handleSendToProduction = async (order: Os) => {
    try {
      const updated = await updateOs(order.id, {
        status_producao: PRODUCAO_STATUSES[0],
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: 'sent_to_production',
        payload: { status_producao: PRODUCAO_STATUSES[0] },
        created_by: user?.id ?? null,
      });
      setOrders((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
      toast.success('OS enviada para produção.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar para produção.');
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando quadro de Arte...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">OS • Arte</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o fluxo de arte e envie OS prontas para produção.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/os/novo">
            <Button>Nova OS</Button>
          </Link>
          <Button variant="outline" onClick={loadData}>
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {ARTE_STATUSES.map((status) => {
          const items = ordersByStatus.get(status) ?? [];
          return (
            <div key={status} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{status}</h2>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-3">
                {items.length === 0 && (
                  <Card className="p-4 text-xs text-muted-foreground">Nenhuma OS neste status.</Card>
                )}
                {items.map((order) => {
                  const title = order.title || `${order.sale_number ?? ''} - ${order.client_name}`.trim();
                  return (
                    <Card key={order.id} className="space-y-3 p-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">OS #{order.os_number ?? '—'}</p>
                        <Link href={`/os/${order.id}`}>
                          <Button variant="link" className="h-auto p-0 text-left">
                            <span className="text-base font-semibold">{title}</span>
                          </Button>
                        </Link>
                        <p className="text-xs text-muted-foreground">{order.client_name}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline">{order.payment_status}</Badge>
                        <span className="text-muted-foreground">{formatDateTime(order.updated_at)}</span>
                      </div>
                      {status === 'Produzir' && (
                        <Button variant="secondary" size="sm" onClick={() => handleSendToProduction(order)}>
                          Enviar para Produção
                        </Button>
                      )}
                      <Select value={order.status_arte ?? ARTE_STATUSES[0]} onValueChange={(value) => handleMove(order, value)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Mover para..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ARTE_STATUSES.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
