import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchOsStatuses, createOs, createOsEvent } from '../api';
import type { OsStatus } from '../types';
import { useAuth } from '@/contexts/AuthContext';

const createSchema = z.object({
  customer_name: z.string().min(1, 'Informe o cliente.'),
  customer_phone: z.string().optional(),
  title: z.string().min(1, 'Informe o título da OS.'),
  description: z.string().optional(),
  status_id: z.string().min(1, 'Selecione o status inicial.'),
  quote_total: z.preprocess((value) => (value === '' ? undefined : Number(value)), z.number().optional()),
});

export default function OsCreatePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [statuses, setStatuses] = useState<OsStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [quoteTotal, setQuoteTotal] = useState('');

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
    if (!customerName) return;
    if (!title || title.startsWith('OS -')) {
      setTitle(`OS - ${customerName}`);
    }
  }, [customerName, title]);

  const statusOptions = useMemo(() => statuses, [statuses]);

  const handleSubmit = async () => {
    const parsed = createSchema.safeParse({
      customer_name: customerName,
      customer_phone: customerPhone || undefined,
      title,
      description: description || undefined,
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
        customer_name: parsed.data.customer_name,
        customer_phone: parsed.data.customer_phone ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status_id: parsed.data.status_id,
        quote_total: parsed.data.quote_total ?? null,
        payment_status: 'PENDING',
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });

      await createOsEvent({
        os_id: os.id,
        type: 'CREATED',
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
              <Label>Cliente</Label>
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
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
            Criar OS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
