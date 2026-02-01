import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { createOrderEvent, updateOrder } from '../api';
import { ART_COLUMNS, PROD_COLUMNS } from '../constants';
import type { LogisticType, OsOrder, ProductionTag } from '../types';
import { useAuth } from '@/contexts/AuthContext';

interface OrderDetailsDialogProps {
  order: OsOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (order: OsOrder) => void;
  onDelete?: (order: OsOrder) => void;
}

const formatStatus = (order: OsOrder | null) => {
  if (!order) return '';
  const boardLabel = order.prod_status ? 'Produção' : 'Arte';
  const columnLabel = order.prod_status ?? order.art_status;
  return `${boardLabel} • ${columnLabel}`;
};

export default function OrderDetailsDialog({
  order,
  open,
  onOpenChange,
  onUpdated,
  onDelete,
}: OrderDetailsDialogProps) {
  const { user, isAdmin } = useAuth();
  const [saleNumber, setSaleNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [logisticType, setLogisticType] = useState<LogisticType>('retirada');
  const [address, setAddress] = useState('');
  const [productionTag, setProductionTag] = useState<ProductionTag | ''>('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setSaleNumber(order.sale_number ?? '');
    setClientName(order.client_name ?? '');
    setTitle(order.title ?? '');
    setDescription(order.description ?? '');
    setDeliveryDate(formatDateDisplay(order.delivery_date));
    setLogisticType(order.logistic_type ?? 'retirada');
    setAddress(order.address ?? '');
    setProductionTag(order.production_tag ?? '');
    setEditing(false);
  }, [order, open]);

  const defaultTitle = useMemo(() => {
    const base = [saleNumber, clientName].filter(Boolean).join(' - ');
    return base.trim();
  }, [saleNumber, clientName]);

  const formatDateDisplay = (value?: string | null) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
    }
    return value;
  };

  const normalizeDate = (value: string) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parts = value.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day && month && year) {
        return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!order) return;
    if (!logisticType) {
      toast.error('Selecione o tipo de entrega.');
      return;
    }
    if (logisticType === 'instalacao' && !address.trim()) {
      toast.error('Informe o endereço de instalação.');
      return;
    }

    try {
      setSaving(true);
      const normalizedDeliveryDate = normalizeDate(deliveryDate);
      const payload: Partial<OsOrder> = {
        sale_number: saleNumber,
        client_name: clientName,
        title: title.trim() || defaultTitle,
        description: description || null,
        delivery_date: normalizedDeliveryDate,
        logistic_type: logisticType,
        address: logisticType === 'retirada' ? null : address.trim() || null,
        production_tag: productionTag || null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };

      if (order.prod_status === 'Produção') {
        payload.production_tag = productionTag || null;
      }

      const updated = await updateOrder(order.id, {
        ...payload,
      });
      onUpdated(updated);
      toast.success('Card atualizado com sucesso.');
      onOpenChange(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : 'Erro ao salvar as alterações.';
      console.error('Erro ao salvar alterações do card.', error);
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleSendToProduction = async () => {
    if (!order) return;
    try {
      setMoving(true);
      const updated = await updateOrder(order.id, {
        art_status: 'Produzir',
        prod_status: PROD_COLUMNS[0],
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'status_change',
          payload: {
            board: 'arte',
            from: order.art_status,
            to: 'Produzir',
          },
          created_by: user?.id ?? null,
        });
        await createOrderEvent({
          os_id: order.id,
          type: 'status_change',
          payload: {
            board: 'producao',
            from: order.prod_status,
            to: PROD_COLUMNS[0],
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de status.', eventError);
      }
      onUpdated(updated);
      toast.success('Card enviado para Produção.');
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar para Produção.');
    } finally {
      setMoving(false);
    }
  };

  const handleBackToArte = async () => {
    if (!order) return;
    try {
      setMoving(true);
      const updated = await updateOrder(order.id, {
        art_status: ART_COLUMNS[0],
        prod_status: null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'status_change',
          payload: {
            board: 'arte',
            from: order.art_status,
            to: ART_COLUMNS[0],
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de status.', eventError);
      }
      onUpdated(updated);
      toast.success('Card movido para Arte.');
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao voltar para Arte.');
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title || defaultTitle || 'Detalhes da OS'}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Status atual: {formatStatus(order)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Número da venda</Label>
              <Input
                value={saleNumber}
                onChange={(event) => setSaleNumber(event.target.value)}
                disabled={!editing}
              />
            </div>
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                disabled={!editing}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={defaultTitle}
              disabled={!editing}
            />
          </div>

          <div className="space-y-1">
            <Label>Descrição detalhada do pedido</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              disabled={!editing}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Data de entrega</Label>
              <Input
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                disabled={!editing}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de entrega</Label>
              <RadioGroup
                value={logisticType}
                onValueChange={(value) => {
                  if (editing) {
                    setLogisticType(value as LogisticType);
                  }
                }}
                disabled={!editing}
              >
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="retirada" />
                    Retirada
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="entrega" />
                    Entrega
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="instalacao" />
                    Instalação
                  </label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {logisticType !== 'retirada' && (
            <div className="space-y-1">
              <Label>Endereço de entrega/instalação</Label>
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={!editing}
              />
            </div>
          )}

          {order?.prod_status === 'Produção' && (
            <div className="space-y-2">
              <Label>Tag de produção</Label>
              <RadioGroup
                value={productionTag}
                onValueChange={(value) => {
                  if (editing) {
                    setProductionTag(value as ProductionTag);
                  }
                }}
                disabled={!editing}
              >
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="EM_PRODUCAO" />
                    Em Produção
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="PRONTO" />
                    Pronto
                  </label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!order?.prod_status && (
              <Button variant="secondary" onClick={handleSendToProduction} disabled={moving}>
                Enviar para Produção
              </Button>
            )}
            {order?.prod_status && isAdmin && (
              <Button variant="outline" onClick={handleBackToArte} disabled={moving} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Arte
              </Button>
            )}
          </div>

          <div className={isAdmin ? 'flex flex-wrap items-center justify-between gap-2' : 'flex flex-wrap justify-end gap-2'}>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-1 h-4 w-4" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Essa ação não pode ser desfeita. O card será excluído permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (!order) return;
                        onDelete?.(order);
                        onOpenChange(false);
                      }}
                    >
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={editing}>
                Editar
              </Button>
              <Button onClick={handleSave} disabled={saving || !editing}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
