import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Copy, FolderPlus } from 'lucide-react';
import {
  createOsEvent,
  createPaymentProof,
  deletePaymentProof,
  fetchOsById,
  fetchOsEvents,
  fetchOsPayments,
  updateOs,
  updatePaymentProof,
} from '../api';
import { generateFolderPath, resolvePaymentStatus } from '../utils';
import type { DeliveryType, Os, OsEvent, OsPaymentProof, PaymentMethod } from '../types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ARTE_STATUSES, PRODUCAO_STATUSES } from '../statuses';
import { MAX_ASSET_FILE_SIZE_BYTES, resolveAssetContentType, sanitizeFilename } from '@/features/hubos/assetUtils';
import { invokeEdgeFunction } from '@/lib/supabase/invokeEdgeFunction';
import { KioskShell } from '../kiosk/KioskShell';

const paymentSchema = z.object({
  method: z.enum(['PIX', 'CARTAO', 'AGENDADO', 'OUTRO']),
  amount: z.preprocess((value) => Number(value), z.number().positive()),
  received_date: z.string().min(1, 'Informe a data de recebimento.'),
  installments: z.string().optional(),
  cadastro_completo: z.boolean(),
});

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const formatCurrency = (value?: number | null) => {
  if (!value) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDeliveryType = (deliveryType: DeliveryType | null) => {
  if (!deliveryType) return '—';
  return deliveryType === 'RETIRADA' ? 'Retirada' : deliveryType === 'ENTREGA' ? 'Entrega' : 'Instalação';
};

export default function OsDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/os/:id');
  const osId = params?.id;
  const queryParamKiosk = new URLSearchParams(window.location.search).get('kiosk');
  const { user, hasModuleAccess } = useAuth();
  const isKioskMode = queryParamKiosk === '1' && hasModuleAccess('hub_os_kiosk');
  const [order, setOrder] = useState<Os | null>(null);
  const [events, setEvents] = useState<OsEvent[]>([]);
  const [payments, setPayments] = useState<OsPaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [openingPaymentId, setOpeningPaymentId] = useState<string | null>(null);

  const [saleNumber, setSaleNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('RETIRADA');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [installationTimeWindow, setInstallationTimeWindow] = useState('');
  const [onSiteContact, setOnSiteContact] = useState('');
  const [statusArte, setStatusArte] = useState('');
  const [statusProducao, setStatusProducao] = useState('');
  const [isReproducao, setIsReproducao] = useState(false);
  const [reproMotivo, setReproMotivo] = useState('');
  const [hasLetraCaixa, setHasLetraCaixa] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentInstallments, setPaymentInstallments] = useState('');
  const [cadastroCompleto, setCadastroCompleto] = useState(false);

  const handleOpenPaymentAttachment = async (payment: OsPaymentProof) => {
    if (payment.attachment_url) {
      window.open(payment.attachment_url, '_blank', 'noreferrer');
      return;
    }

    if (!payment.attachment_path || !payment.attachment_path.startsWith('os_orders/')) {
      toast.error('Comprovante indisponível para download.');
      return;
    }

    try {
      setOpeningPaymentId(payment.id);
      const data = await invokeEdgeFunction<{ downloadUrl: string }>(supabase, 'r2-presign-download', {
        key: payment.attachment_path,
      });

      if (!data?.downloadUrl) {
        throw new Error('Falha ao gerar URL de download.');
      }

      window.open(data.downloadUrl, '_blank', 'noreferrer');
    } catch (downloadError) {
      console.error(downloadError);
      toast.error(downloadError instanceof Error ? downloadError.message : 'Falha ao abrir comprovante.');
    } finally {
      setOpeningPaymentId((current) => (current === payment.id ? null : current));
    }
  };

  const loadData = async () => {
    if (!osId) return;
    try {
      setLoading(true);
      const osData = await fetchOsById(osId);
      setOrder(osData);
      setSaleNumber(osData.sale_number ?? '');
      setClientName(osData.client_name ?? osData.customer_name);
      setCustomerPhone(osData.customer_phone ?? '');
      setTitle(osData.title ?? '');
      setDescription(osData.description ?? '');
      setDeliveryDate(osData.delivery_date ?? '');
      setDeliveryType(osData.delivery_type ?? 'RETIRADA');
      setShippingCarrier(osData.shipping_carrier ?? '');
      setTrackingCode(osData.tracking_code ?? '');
      setAddress(osData.address ?? '');
      setNotes(osData.notes ?? '');
      setInstallationDate(osData.installation_date ?? '');
      setInstallationTimeWindow(osData.installation_time_window ?? '');
      setOnSiteContact(osData.on_site_contact ?? '');
      setStatusArte(osData.status_arte ?? ARTE_STATUSES[0]);
      setStatusProducao(osData.status_producao ?? '');
      setIsReproducao(Boolean(osData.is_reproducao));
      setReproMotivo(osData.repro_motivo ?? '');
      setHasLetraCaixa(Boolean(osData.has_letra_caixa));

      if (isKioskMode) {
        setEvents([]);
        setPayments([]);
        return;
      }

      const [eventData, paymentData] = await Promise.all([fetchOsEvents(osId), fetchOsPayments(osId)]);
      setEvents(eventData);
      setPayments(paymentData);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar a OS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isKioskMode, osId]);

  useEffect(() => {
    if (!isKioskMode) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setLocation('/os/kiosk');
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isKioskMode, setLocation]);

  const handleSaveDetails = async () => {
    if (!order) return;
    try {
      setSaving(true);
      const payload = {
        sale_number: saleNumber,
        client_name: clientName,
        customer_name: clientName,
        customer_phone: customerPhone || null,
        title: title || `${saleNumber} - ${clientName}`,
        description: description || null,
        delivery_date: deliveryDate || null,
        delivery_type: deliveryType,
        shipping_carrier: deliveryType === 'ENTREGA' ? shippingCarrier || null : null,
        tracking_code: deliveryType === 'ENTREGA' ? trackingCode || null : null,
        address: deliveryType === 'ENTREGA' || deliveryType === 'INSTALACAO' ? address || null : null,
        notes: deliveryType === 'ENTREGA' ? notes || null : null,
        installation_date: deliveryType === 'INSTALACAO' ? installationDate || null : null,
        installation_time_window: deliveryType === 'INSTALACAO' ? installationTimeWindow || null : null,
        on_site_contact: deliveryType === 'INSTALACAO' ? onSiteContact || null : null,
        is_reproducao: isReproducao,
        repro_motivo: isReproducao ? reproMotivo || null : null,
        has_letra_caixa: hasLetraCaixa,
        updated_at: new Date().toISOString(),
      };
      const updated = await updateOs(order.id, payload);

      await createOsEvent({
        os_id: order.id,
        type: 'details_updated',
        payload: { sale_number: saleNumber, client_name: clientName, delivery_type: deliveryType },
        created_by: user?.id ?? null,
      });

      if (order.delivery_type !== deliveryType) {
        await createOsEvent({
          os_id: order.id,
          type: 'delivery_type_changed',
          payload: { from: order.delivery_type, to: deliveryType },
          created_by: user?.id ?? null,
        });
      }

      if (order.delivery_date !== deliveryDate || order.installation_date !== installationDate) {
        await createOsEvent({
          os_id: order.id,
          type: 'dates_changed',
          payload: { delivery_date: deliveryDate, installation_date: installationDate },
          created_by: user?.id ?? null,
        });
      }

      setOrder(updated);
      toast.success('Dados atualizados.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar dados da OS.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusArteChange = async (nextStatus: string) => {
    if (!order) return;
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
      setStatusArte(nextStatus);
      setOrder(updated);
      toast.success('Status atualizado.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleStatusProducaoChange = async (nextStatus: string) => {
    if (!order) return;
    try {
      const updated = await updateOs(order.id, {
        status_producao: nextStatus,
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: 'status_producao_changed',
        payload: { from: order.status_producao, to: nextStatus },
        created_by: user?.id ?? null,
      });
      setStatusProducao(nextStatus);
      setOrder(updated);
      toast.success('Status atualizado.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleSendToProduction = async () => {
    if (!order) return;
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
      setStatusProducao(PRODUCAO_STATUSES[0]);
      setOrder(updated);
      toast.success('OS enviada para produção.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar para produção.');
    }
  };

  const handleFolderPath = async () => {
    if (!order) return;
    try {
      const path = generateFolderPath(order.customer_name, order.os_number);
      const updated = await updateOs(order.id, {
        folder_path: path,
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: 'FOLDER_SET',
        payload: { folder_path: path },
        created_by: user?.id ?? null,
      });
      setOrder(updated);
      toast.success('Caminho da pasta gerado.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar caminho da pasta.');
    }
  };

  const handleCopyFolderPath = async () => {
    if (!order?.folder_path) return;
    await navigator.clipboard.writeText(order.folder_path);
    toast.success('Caminho copiado!');
  };



  const handlePaymentSubmit = async () => {
    if (!order) return;

    const parsed = paymentSchema.safeParse({
      method: paymentMethod,
      amount: paymentAmount,
      received_date: paymentDate,
      installments: paymentInstallments || undefined,
      cadastro_completo: cadastroCompleto,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Confira os dados do pagamento.');
      return;
    }

    let createdProof: OsPaymentProof | null = null;
    let uploadedKey: string | null = null;

    try {
      setSaving(true);
      let proof = await createPaymentProof({
        os_id: order.id,
        method: parsed.data.method,
        amount: parsed.data.amount,
        received_date: parsed.data.received_date,
        installments: parsed.data.installments ?? null,
        cadastro_completo: parsed.data.cadastro_completo,
        attachment_path: null,
        attachment_url: null,
        storage_provider: 'r2',
        storage_bucket: null,
        r2_etag: null,
        content_type: null,
        size_bytes: null,
        created_by: user?.id ?? null,
      });
      createdProof = proof;

      if (paymentFile) {
        if (paymentFile.size > MAX_ASSET_FILE_SIZE_BYTES) {
          throw new Error('Arquivo acima de 500MB.');
        }

        const contentType = resolveAssetContentType(paymentFile);
        const sizeBytes = paymentFile.size;
        const sanitizedName = sanitizeFilename(paymentFile.name);
        const key = `os_orders/${order.id}/payment_proofs/${proof.id}/Financeiro/Comprovante/${Date.now()}-${sanitizedName}`;

        const presignData = await invokeEdgeFunction<{ uploadUrl: string; bucket?: string }>(
          supabase,
          'r2-presign-upload',
          {
            key,
            contentType,
            sizeBytes,
          }
        );

        if (!presignData?.uploadUrl) {
          throw new Error('Falha ao gerar URL de upload (R2).');
        }

        const uploadResponse = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
          },
          body: paymentFile,
        });

        if (!uploadResponse.ok) {
          const responseBody = await uploadResponse.text();
          throw new Error(`Falha ao enviar arquivo (HTTP ${uploadResponse.status}): ${responseBody || 'sem detalhes'}`);
        }

        const r2Etag = uploadResponse.headers.get('etag')?.replace(/"/g, '') ?? null;
        uploadedKey = key;

        proof = await updatePaymentProof(proof.id, {
          attachment_path: key,
          attachment_url: null,
          storage_provider: 'r2',
          storage_bucket: presignData.bucket ?? null,
          r2_etag: r2Etag,
          content_type: contentType,
          size_bytes: sizeBytes,
        });
      }

      const nextStatus = resolvePaymentStatus({
        method: parsed.data.method,
        amount: parsed.data.amount,
        receivedDate: parsed.data.received_date,
        quoteTotal: order.quote_total,
      });

      const updated = await updateOs(order.id, {
        payment_status: nextStatus,
        updated_at: new Date().toISOString(),
      });

      await createOsEvent({
        os_id: order.id,
        type: 'PAYMENT_SUBMITTED',
        payload: { payment_id: proof.id, status: nextStatus },
        created_by: user?.id ?? null,
      });

      setOrder(updated);
      setPayments((prev) => [proof, ...prev]);
      setPaymentAmount('');
      setPaymentDate('');
      setPaymentInstallments('');
      setCadastroCompleto(false);
      setPaymentFile(null);
      toast.success('Comprovante enviado.');
    } catch (error) {
      console.error(error);
      if (createdProof && paymentFile && !uploadedKey) {
        try {
          await deletePaymentProof(createdProof.id);
        } catch (cleanupError) {
          console.error('Falha ao limpar comprovante pendente:', cleanupError);
        }
      }
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar comprovante.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando detalhes da OS...</div>;
  }

  if (!order) {
    return <div className="text-muted-foreground">OS não encontrada.</div>;
  }

  if (isKioskMode) {
    return (
      <KioskShell
        title={`OS #${order.os_number ?? '—'}`}
        subtitle="Modo quiosque · somente leitura"
        statusMessage="Pronto para nova leitura"
        mainClassName="items-stretch overflow-auto"
        headerAction={
          <Button size="lg" onClick={() => setLocation('/os/kiosk')}>
            Nova busca
          </Button>
        }
      >
        <div className="grid w-full gap-4 xl:grid-cols-[1.1fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Dados rápidos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Título</p>
                <p className="text-lg font-medium">{order.title || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="text-lg font-medium">{order.client_name || order.customer_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nº da venda</p>
                <p className="font-medium">{order.sale_number || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Criada em</p>
                <p className="font-medium">{formatDateTime(order.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status Arte</p>
                <p className="font-medium">{order.status_arte || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status Produção</p>
                <p className="font-medium">{order.status_producao || '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Tipo de saída</p>
                  <p className="font-medium">{formatDeliveryType(order.delivery_type)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de entrega</p>
                  <p className="font-medium">{order.delivery_date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Letra caixa</p>
                  <p className="font-medium">{order.has_letra_caixa ? 'Sim' : 'Não'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reprodução</p>
                  <p className="font-medium">{order.is_reproducao ? 'Sim' : 'Não'}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Descrição técnica</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{order.description || '—'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Observações</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{order.notes || '—'}</p>
              </div>

              {order.is_reproducao ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Motivo da reprodução</p>
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{order.repro_motivo || '—'}</p>
                </div>
              ) : null}

              {order.delivery_type === 'INSTALACAO' ? (
                <div className="rounded-md border p-4">
                  <p className="mb-2 text-sm font-semibold">Dados de instalação</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium">{order.installation_date || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Janela de horário</p>
                      <p className="font-medium">{order.installation_time_window || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contato no local</p>
                      <p className="font-medium">{order.on_site_contact || '—'}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {order.folder_path ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Caminho da pasta</p>
                  <div className="rounded-md border p-3 text-xs break-all">{order.folder_path}</div>
                  <Button variant="outline" size="sm" onClick={handleCopyFolderPath}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar caminho
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </KioskShell>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">OS #{order.os_number ?? '—'}</h1>
        <p className="text-sm text-muted-foreground">Criada em {formatDateTime(order.created_at)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados principais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Nº da venda</Label>
                <Input value={saleNumber} onChange={(event) => setSaleNumber(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(event) => setClientName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Data de entrega</Label>
                <Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição técnica</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de saída</Label>
              <RadioGroup value={deliveryType} onValueChange={(value) => setDeliveryType(value as DeliveryType)}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="RETIRADA" />
                  Retirada
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="ENTREGA" />
                  Entrega
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="INSTALACAO" />
                  Instalação
                </label>
              </RadioGroup>
            </div>

            {deliveryType === 'ENTREGA' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Transportadora</Label>
                  <Input value={shippingCarrier} onChange={(event) => setShippingCarrier(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Código de rastreio</Label>
                  <Input value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={address} onChange={(event) => setAddress(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Observações</Label>
                  <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </div>
            )}

            {deliveryType === 'INSTALACAO' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Data de instalação</Label>
                  <Input
                    type="date"
                    value={installationDate}
                    onChange={(event) => setInstallationDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Janela de horário</Label>
                  <Input
                    value={installationTimeWindow}
                    onChange={(event) => setInstallationTimeWindow(event.target.value)}
                    placeholder="Ex: 08h-12h"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Endereço</Label>
                  <Input value={address} onChange={(event) => setAddress(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Contato no local</Label>
                  <Input value={onSiteContact} onChange={(event) => setOnSiteContact(event.target.value)} />
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={isReproducao} onCheckedChange={(checked) => setIsReproducao(Boolean(checked))} />
                <Label>Reprodução</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={hasLetraCaixa} onCheckedChange={(checked) => setHasLetraCaixa(Boolean(checked))} />
                <Label>Letra Caixa</Label>
              </div>
              {isReproducao && (
                <div className="space-y-1 md:col-span-2">
                  <Label>Motivo da reprodução</Label>
                  <Input value={reproMotivo} onChange={(event) => setReproMotivo(event.target.value)} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSaveDetails} disabled={saving}>
                Salvar alterações
              </Button>
              <Badge variant="outline">Status financeiro: {order.payment_status}</Badge>
              <span className="text-sm text-muted-foreground">Total orçamento: {formatCurrency(order.quote_total)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status & pasta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status Arte</Label>
              <Select value={statusArte} onValueChange={handleStatusArteChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {ARTE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusArte === 'Produzir' && (
                <Button variant="outline" size="sm" onClick={handleSendToProduction}>
                  Enviar para Produção
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status Produção</Label>
              <Select value={statusProducao} onValueChange={handleStatusProducaoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCAO_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Caminho da pasta</Label>
              {order.folder_path ? (
                <div className="space-y-2">
                  <div className="rounded-md border p-3 text-xs text-muted-foreground break-all">
                    {order.folder_path}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyFolderPath}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar caminho
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={handleFolderPath}>
                  <FolderPlus className="mr-2 h-4 w-4" /> Gerar caminho da pasta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pagamento / Comprovante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Método</Label>
                <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="CARTAO">Cartão</SelectItem>
                    <SelectItem value="AGENDADO">Agendado</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Data de recebimento</Label>
                <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Parcelas</Label>
                <Input
                  value={paymentInstallments}
                  onChange={(event) => setPaymentInstallments(event.target.value)}
                  placeholder="Ex: 1/2"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={cadastroCompleto} onCheckedChange={(checked) => setCadastroCompleto(Boolean(checked))} />
              <Label>Cadastro completo</Label>
            </div>

            <div className="space-y-1">
              <Label>Comprovante</Label>
              <Input
                type="file"
                onChange={(event) => setPaymentFile(event.target.files?.[0] ?? null)}
                accept="image/*,application/pdf"
              />
            </div>

            <Button onClick={handlePaymentSubmit} disabled={saving}>
              Enviar comprovante
            </Button>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Histórico de comprovantes</h3>
              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum comprovante enviado.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="rounded-md border p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span>{payment.method}</span>
                        <Badge variant="outline">{payment.status}</Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {formatCurrency(payment.amount)} • {payment.received_date}
                      </div>
                      {(payment.attachment_url ||
                        payment.attachment_path?.startsWith('os_orders/')) && (
                        <button
                          type="button"
                          onClick={() => handleOpenPaymentAttachment(payment)}
                          className="text-primary underline disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={openingPaymentId === payment.id}
                        >
                          {openingPaymentId === payment.id ? 'Gerando link…' : 'Ver comprovante'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auditoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{event.type}</span>
                    <span className="text-muted-foreground">{formatDateTime(event.created_at)}</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
