import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchPendingSecondInstallments } from '@/features/hubos/finance';
import type { FinanceInstallment } from '@/features/hubos/types';
import { uploadReceiptForOrder } from '@/features/hubos/assets';
import { useAuth } from '@/contexts/AuthContext';

export default function OsPendentesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<FinanceInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchPendingSecondInstallments();
      setItems(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar os pendentes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const handleSubmitSecondProof = async () => {
    if (!selected?.os_orders?.id || !file) {
      toast.error('Selecione um comprovante.');
      return;
    }

    try {
      setSending(true);
      await uploadReceiptForOrder({
        osId: selected.os_orders.id,
        file,
        userId: user?.id ?? null,
        installmentLabel: '2/2',
      });
      toast.success('Comprovante 2/2 anexado com sucesso.');
      setFile(null);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Falha ao anexar comprovante 2/2.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pendentes — 2ª Parcela</h1>
          <p className="text-sm text-muted-foreground">OS aguardando comprovante da parcela 2/2.</p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/hub-os')}>Voltar ao Hub OS</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Lista ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loading && items.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma OS pendente de 2ª parcela.</p>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left text-sm ${selectedId === item.id ? 'border-primary' : 'border-border'}`}
                onClick={() => setSelectedId(item.id)}
              >
                <p className="font-medium">OS #{item.os_orders?.sale_number ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{item.os_orders?.client_name ?? 'Sem cliente'}</p>
                <p className="text-xs text-muted-foreground">Venc.: {item.due_date ?? '—'}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && <p className="text-sm text-muted-foreground">Selecione uma OS para anexar o comprovante.</p>}
            {selected && (
              <>
                <div className="space-y-1 text-sm">
                  <p><span className="font-medium">OS:</span> #{selected.os_orders?.sale_number}</p>
                  <p><span className="font-medium">Cliente:</span> {selected.os_orders?.client_name}</p>
                  <p><span className="font-medium">Parcela:</span> {selected.installment_no}/{selected.total_installments}</p>
                  <p><span className="font-medium">Data 2ª parcela:</span> {selected.due_date ?? '—'}</p>
                </div>
                <div className="space-y-2">
                  <Label>Anexar comprovante 2ª parcela</Label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <Button onClick={handleSubmitSecondProof} disabled={!file || sending}>
                  {sending ? 'Enviando...' : 'Anexar comprovante 2/2'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
