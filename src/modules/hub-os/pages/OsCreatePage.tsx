import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchOsStatuses, createOs, createOsEvent } from '../api';
import type { DeliveryType, OsStatus } from '../types';
import { useAuth } from '@/contexts/AuthContext';

type ArtFileItem = {
  id: string;
  file: File;
  url: string;
};

type FinancialDocumentItem = {
  id: string;
  type: string;
  file?: File;
};

const financialDocumentOptions = [
  'Boleto',
  'Nota fiscal',
  'Comprovante de pagamento',
  'Contrato',
  'Outro',
];

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSchema = z.object({
  sale_number: z.string().min(1, 'Informe o número da venda.'),
  client_name: z.string().min(1, 'Informe o cliente.'),
  customer_phone: z.string().optional(),
  title: z.string().min(1, 'Informe o título da OS.'),
  description: z.string().min(1, 'Informe a descrição técnica.'),
  delivery_date: z.string().min(1, 'Informe a data de entrega.'),
  delivery_type: z.enum(['RETIRADA', 'ENTREGA', 'INSTALACAO']),
  status_id: z.string().min(1, 'Selecione o status inicial.'),
  quote_total: z.preprocess((value) => (value === '' ? undefined : Number(value)), z.number().optional()),
});

export default function OsCreatePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [statuses, setStatuses] = useState<OsStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [saleNumber, setSaleNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [quoteTotal, setQuoteTotal] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('RETIRADA');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [installationTimeWindow, setInstallationTimeWindow] = useState('');
  const [onSiteContact, setOnSiteContact] = useState('');
  const [isReproducao, setIsReproducao] = useState(false);
  const [reproMotivo, setReproMotivo] = useState('');
  const [hasLetraCaixa, setHasLetraCaixa] = useState(false);
  const [artFiles, setArtFiles] = useState<ArtFileItem[]>([]);
  const [financialDocuments, setFinancialDocuments] = useState<FinancialDocumentItem[]>([
    { id: createId(), type: '' },
  ]);
  const artFilesRef = useRef<ArtFileItem[]>([]);

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        setLoading(true);
        const data = await fetchOsStatuses();
        setStatuses(data);
        const initial = data.find((status) => status.name === 'Caixa de Entrada') ?? data[0];
        if (initial) {
          setStatusId(initial.id);
        }
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível carregar os status da OS.');
      } finally {
        setLoading(false);
      }
    };

    loadStatuses();
  }, []);

  useEffect(() => {
    artFilesRef.current = artFiles;
  }, [artFiles]);

  useEffect(() => {
    return () => {
      artFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (!saleNumber && !clientName) return;
    if (!title || title.includes(' - ')) {
      const nextTitle = [saleNumber, clientName].filter(Boolean).join(' - ');
      if (nextTitle) setTitle(nextTitle);
    }
  }, [saleNumber, clientName, title]);

  const statusOptions = useMemo(() => statuses, [statuses]);

  const handleSubmit = async () => {
    const parsed = createSchema.safeParse({
      sale_number: saleNumber,
      client_name: clientName,
      customer_phone: customerPhone || undefined,
      title,
      description,
      delivery_date: deliveryDate,
      delivery_type: deliveryType,
      status_id: statusId,
      quote_total: quoteTotal,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Confira os dados da OS.');
      return;
    }

    try {
      setSaving(true);
      const os = await createOs({
        sale_number: parsed.data.sale_number,
        client_name: parsed.data.client_name,
        customer_name: parsed.data.client_name,
        customer_phone: parsed.data.customer_phone ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        delivery_date: parsed.data.delivery_date,
        delivery_type: parsed.data.delivery_type,
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
        status_id: parsed.data.status_id,
        status_arte: 'Caixa de Entrada',
        status_producao: null,
        quote_total: parsed.data.quote_total ?? null,
        payment_status: 'PENDING',
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });

      await createOsEvent({
        os_id: os.id,
        type: 'created',
        payload: { source: 'manual' },
        created_by: user?.id ?? null,
      });

      toast.success('OS criada com sucesso!');
      setLocation(`/os/${os.id}`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar a OS.');
    } finally {
      setSaving(false);
    }
  };

  const handleArtFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const nextItems = files.map((file) => ({
      id: createId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setArtFiles((prev) => [...prev, ...nextItems]);
    event.target.value = '';
  };

  const handleRemoveArtFile = (id: string) => {
    setArtFiles((prev) => {
      const item = prev.find((fileItem) => fileItem.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((fileItem) => fileItem.id !== id);
    });
  };

  const handleAddFinancialDocument = () => {
    setFinancialDocuments((prev) => [...prev, { id: createId(), type: '' }]);
  };

  const handleRemoveFinancialDocument = (id: string) => {
    setFinancialDocuments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDocumentTypeChange = (id: string, value: string) => {
    setFinancialDocuments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, type: value } : item))
    );
  };

  const handleDocumentFileChange = (id: string, file?: File) => {
    setFinancialDocuments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, file } : item))
    );
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando formulário...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nova OS</h1>
        <p className="text-sm text-muted-foreground">Preencha os dados principais para abrir a ordem de serviço.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da OS</CardTitle>
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
            <div className="space-y-1">
              <Label>Status inicial</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição técnica</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              placeholder="Resumo técnico do orçamento (copie da calculadora, se necessário)."
            />
          </div>

          <div className="space-y-6 rounded-lg border border-border/60 p-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Anexos</h2>
              <p className="text-sm text-muted-foreground">Organize arquivos de arte e documentos financeiros.</p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Arquivos de arte e referências (opcional)</p>
                <p className="text-xs text-muted-foreground">
                  📎 Dropzone: “Arraste e solte ou clique para anexar”
                </p>
              </div>
              <label
                htmlFor="art-files"
                className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
              >
                <span className="text-base">📎</span>
                <span>Arraste e solte ou clique para anexar</span>
                <span className="text-xs">Formatos aceitos: PDF, JPG, PNG, AI, PSD.</span>
              </label>
              <Input id="art-files" type="file" multiple className="hidden" onChange={handleArtFilesChange} />

              <div className="rounded-lg border border-border/60">
                <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr] gap-3 border-b border-border/60 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  <span>Nome</span>
                  <span>Tamanho</span>
                  <span>Tipo</span>
                  <span>Ações</span>
                </div>
                {artFiles.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum arquivo anexado.</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {artFiles.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr] items-center gap-3 px-4 py-2 text-sm"
                      >
                        <span className="truncate">{item.file.name}</span>
                        <span>{formatBytes(item.file.size)}</span>
                        <span className="uppercase">{item.file.type || '—'}</span>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveArtFile(item.id)}>
                            Remover
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a href={item.url} download={item.file.name}>
                              Baixar
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Documentos financeiros (opcional)</p>
                  <p className="text-xs text-muted-foreground">Organize boletos, notas e comprovantes.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddFinancialDocument}>
                  + Adicionar documento
                </Button>
              </div>

              <div className="space-y-3">
                {financialDocuments.map((document, index) => (
                  <div key={document.id} className="rounded-lg border border-border/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">Documento {index + 1}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFinancialDocument(document.id)}
                      >
                        Remover
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Tipo do documento</Label>
                        <Select value={document.type} onValueChange={(value) => handleDocumentTypeChange(document.id, value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {financialDocumentOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Arquivo (upload)</Label>
                        <Input
                          type="file"
                          onChange={(event) =>
                            handleDocumentFileChange(document.id, event.target.files?.[0])
                          }
                        />
                        {document.file && (
                          <p className="text-xs text-muted-foreground">Selecionado: {document.file.name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                <Input type="date" value={installationDate} onChange={(event) => setInstallationDate(event.target.value)} />
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

          <div className="space-y-1">
            <Label>Total do orçamento (opcional)</Label>
            <Input
              type="number"
              step="0.01"
              value={quoteTotal}
              onChange={(event) => setQuoteTotal(event.target.value)}
              placeholder="0,00"
            />
          </div>

          <Button onClick={handleSubmit} disabled={saving}>
            Gerar OS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
