import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { fetchOsList, fetchOsStatuses, updateOs, createOsEvent } from '../api';
import type { Os, OsStatus } from '../types';
import { useAuth } from '@/contexts/AuthContext';

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function OsKanbanPage() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<OsStatus[]>([]);
  const [orders, setOrders] = useState<Os[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusData, osData] = await Promise.all([fetchOsStatuses(), fetchOsList()]);
      setStatuses(statusData);
      setOrders(osData);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar o Hub OS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const ordersByStatus = useMemo(() => {
    const map = new Map<string, Os[]>();
    statuses.forEach((status) => map.set(status.id, []));
    orders.forEach((order) => {
      if (!map.has(order.status_id)) {
        map.set(order.status_id, []);
      }
      map.get(order.status_id)?.push(order);
    });
    return map;
  }, [orders, statuses]);

  const handleMove = async (order: Os, nextStatusId: string) => {
    try {
      const updated = await updateOs(order.id, {
        status_id: nextStatusId,
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: 'STATUS_CHANGED',
        payload: { from: order.status_id, to: nextStatusId },
        created_by: user?.id ?? null,
      });
      setOrders((prev) => prev.map((item) => (item.id === order.id ? updated : item)));
      toast.success('Status atualizado.');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao mover a OS.');
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando Hub OS...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Hub OS</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe e mova ordens de serviço pelos status configurados.
          </p>
        </div>
        <Button variant="outline" onClick={loadData}>
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {statuses.map((status) => {
          const items = ordersByStatus.get(status.id) ?? [];
          return (
            <div key={status.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {status.name}
                </h2>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-3">
                {items.length === 0 && (
                  <Card className="p-4 text-xs text-muted-foreground">
                    Nenhuma OS neste status.
                  </Card>
                )}
                {items.map((order) => (
                  <Card key={order.id} className="space-y-3 p-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">OS #{order.os_number ?? '—'}</p>
                      <Link href={`/os/${order.id}`}>
                        <Button variant="link" className="h-auto p-0 text-left">
                          <span className="text-base font-semibold">{order.customer_name}</span>
                        </Button>
                      </Link>
                      <p className="text-xs text-muted-foreground">{order.title}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="outline">{order.payment_status}</Badge>
                      <span className="text-muted-foreground">{formatDateTime(order.updated_at)}</span>
                    </div>
                    <Select value={order.status_id} onValueChange={(value) => handleMove(order, value)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Mover para..." />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
