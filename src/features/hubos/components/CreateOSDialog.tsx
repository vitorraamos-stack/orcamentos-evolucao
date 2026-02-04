import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { LogisticType, OsOrder } from '../types';
import { createOrder } from '../api';
import { ART_COLUMNS } from '../constants';
import { useAuth } from '@/contexts/AuthContext';
import { uploadAssetsForOrder, validateFiles } from '@/features/hubos/assets';
import { MAX_ASSET_FILE_SIZE_BYTES } from '@/features/hubos/assetUtils';

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
  const [saving, setSaving] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<OsOrder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reproducao = false;
  const letraCaixa = false;

  const reset = () => {
    setSaleNumber('');
    setClientName('');
    setDescription('');
    setDeliveryDate('');
    setLogisticType('retirada');
    setAddress('');
    setSelectedFiles([]);
    setPendingOrder(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const handleAssetChange = (files: FileList | null) => {
    if (!files) return;
    const nextFiles = [...selectedFiles, ...Array.from(files)];
    const validation = validateFiles(nextFiles);
    if (!validation.ok) {
      toast.error(validation.error ?? 'Arquivos inválidos.');
      return;
    }
    setSelectedFiles(nextFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAssetFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = async () => {
    const assetValidation = validateFiles(selectedFiles);
    if (!assetValidation.ok) {
      toast.error(assetValidation.error ?? 'Arquivos inválidos.');
      return;
    }

    if (pendingOrder) {
      if (selectedFiles.length === 0) {
        toast.error('Selecione ao menos um arquivo para reenviar.');
        return;
      }

      try {
        setUploadingAssets(true);
        await uploadAssetsForOrder({
          osId: pendingOrder.id,
          files: selectedFiles,
          userId: user?.id ?? null,
        });
        toast.success('Arquivos enviados e aguardando sincronização.');
        reset();
        setOpen(false);
      } catch (uploadError) {
        console.error(uploadError);
        toast.error('Falha ao reenviar os arquivos. Tente novamente.');
      } finally {
        setUploadingAssets(false);
      }
      return;
    }

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

      if (selectedFiles.length > 0) {
        try {
          setUploadingAssets(true);
          await uploadAssetsForOrder({
            osId: order.id,
            files: selectedFiles,
            userId: user?.id ?? null,
          });
          toast.success('Arquivos enviados e aguardando sincronização.');
        } catch (uploadError) {
          console.error(uploadError);
          toast.error('OS criada, mas o envio dos arquivos falhou. Reenvie os arquivos.');
          setPendingOrder(order);
          return;
        } finally {
          setUploadingAssets(false);
        }
      }
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
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
              <Input
                value={saleNumber}
                onChange={(event) => setSaleNumber(event.target.value)}
                disabled={Boolean(pendingOrder)}
              />
            </div>
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                disabled={Boolean(pendingOrder)}
              />
            </div>
            <div className="space-y-1">
              <Label>Data de entrega</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                disabled={Boolean(pendingOrder)}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de logística</Label>
              <Select
                value={logisticType}
                onValueChange={(value) => setLogisticType(value as LogisticType)}
                disabled={Boolean(pendingOrder)}
              >
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
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder={`Descrição detalhada do pedido:
Material:
Orientações para a criação de arte:`}
              disabled={Boolean(pendingOrder)}
            />
          </div>

          {logisticType !== 'retirada' && (
            <div className="space-y-1">
              <Label>Endereço (opcional)</Label>
              <Input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={Boolean(pendingOrder)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="os-assets">Arquivos de arte e referências (opcional)</Label>
            <Input
              ref={fileInputRef}
              id="os-assets"
              type="file"
              multiple
              disabled={uploadingAssets}
              onChange={(event) => handleAssetChange(event.target.files)}
            />
            <p className="text-xs text-muted-foreground">
              Máximo de {Math.round(MAX_ASSET_FILE_SIZE_BYTES / 1024 / 1024)}MB por arquivo.
            </p>
            {selectedFiles.length > 0 && (
              <ul className="space-y-2 rounded-md border border-muted p-3 text-sm">
                {selectedFiles.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAssetFile(index)}
                      disabled={uploadingAssets}
                    >
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {pendingOrder && (
              <p className="text-xs text-amber-600">
                A OS foi criada. Reenvie os arquivos para concluir a sincronização.
              </p>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={saving || uploadingAssets}>
            {pendingOrder ? 'Enviar arquivos' : 'Gerar Ordem de Serviço'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
