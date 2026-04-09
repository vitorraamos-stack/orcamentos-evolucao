import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fetchOsList, updateOs, createOsEvent } from '../api';
import type { Os } from '../types';
import { ARTE_STATUSES, PRODUCAO_STATUSES } from '../statuses';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { uploadLayoutForOrder, validateFiles } from '@/features/hubos/assets';

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const APPROVAL_STATUS = 'Aguardando Aprovação da Arte';
const normalizeStatus = (status?: string | null) =>
  (status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const APPROVAL_COPY_TEXT =
  'Olá! 👋 Sua arte está pronta para aprovação.\n\nPara garantirmos que o seu material fique perfeito, pedimos que você confira *COM MUITA ATENÇÃO* a imagem.\n\n\n*📌 Checklist de Conferência:*\n*• Textos e Números:* Verifique toda a ortografia, telefones e endereços.\n*• Medidas:* Confira se as dimensões informadas estão corretas.\n*• Links e QR Codes:* Se houver, teste a leitura e o direcionamento.\n*• Cores:* Lembre-se que pode haver uma variação de até 10% na tonalidade entre o que você vê na tela (celular/computador) e o material impresso.\n\n\n*⚠️ Importante:* A produção é iniciada exatamente com o arquivo aprovado nesta etapa. Após a sua aprovação, não conseguimos cobrir custos de reprodução por erros de grafia, medidas ou artes enviadas por você que estejam fora dos padrões.\n\n\nEstá tudo certinho? Se sim, é só responder com *"ARTE APROVADA"* para mandarmos para a produção! 🚀';

export default function OsArteBoardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<Os[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingApprovalMove, setPendingApprovalMove] = useState<{ order: Os; nextStatus: string } | null>(null);
  const [pendingLayoutMove, setPendingLayoutMove] = useState<{ order: Os; nextStatus: string } | null>(null);
  const [selectedLayoutFile, setSelectedLayoutFile] = useState<File | null>(null);
  const [isDraggingLayoutFile, setIsDraggingLayoutFile] = useState(false);
  const [isMovingWithoutLayout, setIsMovingWithoutLayout] = useState(false);
  const [isSendingLayoutAndMoving, setIsSendingLayoutAndMoving] = useState(false);
  const layoutInputRef = useRef<HTMLInputElement | null>(null);

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
      return true;
    } catch (error) {
      console.error(error);
      toast.error('Falha ao mover a OS.');
      return false;
    }
  };

  const handleMoveRequest = (order: Os, nextStatus: string) => {
    if (nextStatus === APPROVAL_STATUS && order.status_arte !== APPROVAL_STATUS) {
      setPendingApprovalMove({ order, nextStatus });
      return;
    }
    if (
      normalizeStatus(nextStatus) === 'produzir' &&
      normalizeStatus(order.status_arte) !== 'produzir'
    ) {
      setPendingLayoutMove({ order, nextStatus });
      return;
    }
    void handleMove(order, nextStatus);
  };

  const resetLayoutModalState = () => {
    setPendingLayoutMove(null);
    setSelectedLayoutFile(null);
    setIsDraggingLayoutFile(false);
    setIsMovingWithoutLayout(false);
    setIsSendingLayoutAndMoving(false);
    if (layoutInputRef.current) {
      layoutInputRef.current.value = '';
    }
  };

  const handleLayoutModalOpenChange = (open: boolean) => {
    if (!open && !isMovingWithoutLayout && !isSendingLayoutAndMoving) {
      resetLayoutModalState();
    }
  };

  const selectLayoutFile = (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    if (incomingFiles.length > 1) {
      toast.warning('Apenas 1 arquivo é permitido. Usando o primeiro arquivo enviado.');
    }
    const [candidate] = incomingFiles;
    if (!candidate) return;

    const validation = validateFiles([candidate]);
    if (!validation.ok) {
      toast.error(validation.error ?? 'Arquivo inválido.');
      return;
    }

    setSelectedLayoutFile(candidate);
  };

  const handleLayoutInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    selectLayoutFile(files);
  };

  const handleMoveWithoutLayout = async () => {
    if (!pendingLayoutMove || isMovingWithoutLayout || isSendingLayoutAndMoving) return;
    try {
      setIsMovingWithoutLayout(true);
      const moved = await handleMove(pendingLayoutMove.order, pendingLayoutMove.nextStatus);
      if (moved) {
        resetLayoutModalState();
      }
    } finally {
      setIsMovingWithoutLayout(false);
    }
  };

  const handleUploadLayoutAndMove = async () => {
    if (!pendingLayoutMove || isMovingWithoutLayout || isSendingLayoutAndMoving) return;
    if (!selectedLayoutFile) {
      toast.error('Selecione um layout para continuar.');
      return;
    }

    try {
      setIsSendingLayoutAndMoving(true);
      const fromStatus = pendingLayoutMove.order.status_arte;
      const layoutAsset = await uploadLayoutForOrder({
        osId: pendingLayoutMove.order.id,
        file: selectedLayoutFile,
        userId: user?.id ?? null,
      });
      await createOsEvent({
        os_id: pendingLayoutMove.order.id,
        type: 'layout_uploaded',
        payload: {
          asset_id: layoutAsset.id,
          filename: layoutAsset.filename,
          from_status: fromStatus,
          to_status: pendingLayoutMove.nextStatus,
        },
        created_by: user?.id ?? null,
      });
      const moved = await handleMove(pendingLayoutMove.order, pendingLayoutMove.nextStatus);
      if (!moved) {
        return;
      }
      toast.success('Layout enviado e OS movida para Produzir.');
      resetLayoutModalState();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar layout. A OS não foi movida.');
    } finally {
      setIsSendingLayoutAndMoving(false);
    }
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

      <Dialog open={pendingApprovalMove !== null} onOpenChange={(open) => !open && setPendingApprovalMove(null)}>
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
            <Button type="button" variant="outline" onClick={() => setPendingApprovalMove(null)}>
              Não
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingApprovalMove) return;
                void handleMove(pendingApprovalMove.order, pendingApprovalMove.nextStatus);
                setPendingApprovalMove(null);
              }}
            >
              Sim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingLayoutMove !== null} onOpenChange={handleLayoutModalOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar layout para Produzir</DialogTitle>
            <DialogDescription>Envie o layout completo com descrição</DialogDescription>
          </DialogHeader>
          <div
            className={`rounded-md border-2 border-dashed p-4 transition-colors ${
              isDraggingLayoutFile ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onClick={() => layoutInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDraggingLayoutFile(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDraggingLayoutFile(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDraggingLayoutFile(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDraggingLayoutFile(false);
              const files = Array.from(event.dataTransfer.files ?? []);
              selectLayoutFile(files);
            }}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files ?? []);
              if (files.length === 0) return;
              event.preventDefault();
              selectLayoutFile(files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                layoutInputRef.current?.click();
              }
            }}
          >
            <Input
              ref={layoutInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.ai,.eps,.cdr,.png,.jpg,.jpeg,.webp"
              onChange={handleLayoutInputChange}
            />
            <p className="text-sm font-medium">Clique, arraste e solte ou cole o arquivo aqui.</p>
            <p className="text-xs text-muted-foreground">Formatos aceitos: PDF, AI, EPS, CDR, PNG, JPG e WEBP.</p>
            {selectedLayoutFile ? (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{selectedLayoutFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedLayoutFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedLayoutFile(null);
                    if (layoutInputRef.current) {
                      layoutInputRef.current.value = '';
                    }
                  }}
                >
                  Remover arquivo
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMoveWithoutLayout()}
              disabled={isMovingWithoutLayout || isSendingLayoutAndMoving}
            >
              {isMovingWithoutLayout ? 'Movendo...' : 'Sem layout'}
            </Button>
            <Button
              type="button"
              onClick={() => void handleUploadLayoutAndMove()}
              disabled={isMovingWithoutLayout || isSendingLayoutAndMoving}
            >
              {isSendingLayoutAndMoving
                ? 'Enviando layout...'
                : 'Layout enviado - Mover para a próxima etapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
