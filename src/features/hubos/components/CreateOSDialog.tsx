import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { LogisticType, OsOrder } from '../types';
import { createOrder } from '../api';
import { ART_COLUMNS } from '../constants';
import { useAuth } from '@/contexts/AuthContext';

interface CreateOSDialogProps {
  onCreated: (order: OsOrder) => void;
}

export default function CreateOSDialog({ onCreated }: CreateOSDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saleNumber, setSaleNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [logisticType, setLogisticType] = useState<LogisticType>('retirada');
  const [address, setAddress] = useState('');
  const [reproducao, setReproducao] = useState(false);
  const [letraCaixa, setLetraCaixa] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSaleNumber('');
    setClientName('');
    setDescription('');
    setDeliveryDate('');
    setLogisticType('retirada');
    setAddress('');
    setReproducao(false);
    setLetraCaixa(false);
  };

  const handleSubmit = async () => {
    if (!saleNumber || !clientName || !description || !deliveryDate) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    try {
      setSaving(true);
      const order = await createOrder({
        sale_number: saleNumber,
        client_name: clientName,
        description,
        delivery_date: deliveryDate,
        logistic_type: logisticType,
        address: logisticType === 'retirada' ? null : address || null,
        art_status: ART_COLUMNS[0],
        prod_status: null,
        reproducao,
        letra_caixa: letraCaixa,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
      onCreated(order);
      toast.success('Ordem criada com sucesso.');
      reset();
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar ordem de serviço.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Gerar Ordem de Serviço</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Nº da venda</Label>
              <Input value={saleNumber} onChange={(event) => setSaleNumber(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Input value={clientName} onChange={(event) => setClientName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data de entrega</Label>
              <Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tipo de logística</Label>
              <Select value={logisticType} onValueChange={(value) => setLogisticType(value as LogisticType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retirada">Retirada</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </div>

          {logisticType !== 'retirada' && (
            <div className="space-y-1">
              <Label>Endereço (opcional)</Label>
              <Input value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={reproducao} onCheckedChange={(checked) => setReproducao(Boolean(checked))} />
              Reprodução
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={letraCaixa} onCheckedChange={(checked) => setLetraCaixa(Boolean(checked))} />
              Letra Caixa
            </label>
          </div>

          <Button onClick={handleSubmit} disabled={saving}>
            Gerar Ordem de Serviço
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
