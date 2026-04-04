import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fetchOsList, updateOs, createOsEvent } from '../api';
import type { Os } from '../types';
import { ARTE_STATUSES, PRODUCAO_STATUSES } from '../statuses';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const APPROVAL_STATUS = 'Aguardando Aprovação da Arte';

const APPROVAL_COPY_TEXT =
  'Olá! 👋 Sua arte está pronta para aprovação.\n\nPara garantirmos que o seu material fique perfeito, pedimos que você confira *COM MUITA ATENÇÃO* a imagem.\n\n\n*📌 Checklist de Conferência:*\n*• Textos e Números:* Verifique toda a ortografia, telefones e endereços.\n*• Medidas:* Confira se as dimensões informadas estão corretas.\n*• Links e QR Codes:* Se houver, teste a leitura e o direcionamento.\n*• Cores:* Lembre-se que pode haver uma variação de até 10% na tonalidade entre o que você vê na tela (celular/computador) e o material impresso.\n\n\n*⚠️ Importante:* A produção é iniciada exatamente com o arquivo aprovado nesta etapa. Após a sua aprovação, não conseguimos cobrir custos de reprodução por erros de grafia, medidas ou artes enviadas por você que estejam fora dos padrões.\n\n\nEstá tudo certinho? Se sim, é só responder com *"ARTE APROVADA"* para mandarmos para a produção! 🚀';

export default function OsArteBoardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<Os[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingMove, setPendingMove] = useState<{ order: Os; nextStatus: string } | null>(null);

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

  const handleMoveRequest = (order: Os, nextStatus: string) => {
    if (nextStatus === APPROVAL_STATUS && order.status_arte !== APPROVAL_STATUS) {
      setPendingMove({ order, nextStatus });
      return;
    }
    void handleMove(order, nextStatus);
  };

  const handleCopyApprovalText = async () => {
    try {
      await navigator.clipboard.writeText(APPROVAL_COPY_TEXT);
      toast.success('Texto de aprovação copiado.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível copiar o texto de aprovação.');
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
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value="arte"
            onValueChange={(value) => value && setLocation(`/os/${value}`)}
            variant="outline"
            className="bg-background"
          >
            <ToggleGroupItem value="arte">Arte</ToggleGroupItem>
            <ToggleGroupItem value="producao">Produção</ToggleGroupItem>
          </ToggleGroup>
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
                      <Select value={order.status_arte ?? ARTE_STATUSES[0]} onValueChange={(value) => handleMoveRequest(order, value)}>
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

      <Dialog open={pendingMove !== null} onOpenChange={(open) => !open && setPendingMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmação de envio para aprovação</DialogTitle>
            <DialogDescription>
              Você confirma que enviou o texto de aprovação de arte para o cliente?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCopyApprovalText}>
              Copiar texto de aprovação
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingMove(null)}>
              Não
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingMove) return;
                void handleMove(pendingMove.order, pendingMove.nextStatus);
                setPendingMove(null);
              }}
            >
              Sim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
