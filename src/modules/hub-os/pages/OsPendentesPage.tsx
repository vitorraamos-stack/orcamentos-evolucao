import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchFinanceQueue,
  fetchPendingSecondInstallments,
  updateFinanceInstallment,
} from "@/features/hubos/finance";
import type { FinanceInstallment } from "@/features/hubos/types";
import { uploadReceiptForOrder } from "@/features/hubos/assets";
import { useAuth } from "@/contexts/AuthContext";
import { labelFinanceStatus } from "@/lib/financeStatusLabels";

export default function OsPendentesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [secondInstallmentItems, setSecondInstallmentItems] = useState<
    FinanceInstallment[]
  >([]);
  const [registrationPendingItems, setRegistrationPendingItems] = useState<
    FinanceInstallment[]
  >([]);
  const [rejectedItems, setRejectedItems] = useState<FinanceInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [consultantNote, setConsultantNote] = useState("");
  const [returningToFinance, setReturningToFinance] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [secondData, registrationPendingData, rejectedData] =
        await Promise.all([
          fetchPendingSecondInstallments(),
          fetchFinanceQueue(["CADASTRO_PENDENTE"]),
          fetchFinanceQueue(["REJEITADO"]),
        ]);

      setSecondInstallmentItems(secondData);
      setRegistrationPendingItems(registrationPendingData);
      setRejectedItems(rejectedData);

      setSelectedKey(current => {
        if (current) return current;
        if (secondData[0]) return `second:${secondData[0].id}`;
        if (registrationPendingData[0])
          return `cadastro:${registrationPendingData[0].id}`;
        if (rejectedData[0]) return `rejected:${rejectedData[0].id}`;
        return null;
      });
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar os pendentes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const [group, id] = selectedKey.split(":");
    const source =
      group === "second"
        ? secondInstallmentItems
        : group === "cadastro"
          ? registrationPendingItems
          : rejectedItems;
    return source.find(item => item.id === id) ?? null;
  }, [
    selectedKey,
    secondInstallmentItems,
    registrationPendingItems,
    rejectedItems,
  ]);

  const selectedGroup = selectedKey?.split(":")[0] ?? null;

  const handleSubmitSecondProof = async () => {
    if (!selected?.os_orders?.id || !file) {
      toast.error("Selecione um comprovante.");
      return;
    }

    try {
      setSending(true);
      await uploadReceiptForOrder({
        osId: selected.os_orders.id,
        file,
        userId: user?.id ?? null,
        installmentLabel: "2/2",
      });
      toast.success("Comprovante 2/2 anexado com sucesso.");
      setFile(null);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao anexar comprovante 2/2."
      );
    } finally {
      setSending(false);
    }
  };

  const handleReturnToFinanceQueue = async () => {
    if (!selected) {
      toast.error("Selecione uma solicitação.");
      return;
    }

    try {
      setReturningToFinance(true);
      const notePrefix =
        selectedGroup === "cadastro"
          ? "Consultor confirmou atualização de cadastro."
          : "Consultor confirmou ajuste solicitado (rejeitado).";

      const nextNote = [notePrefix, consultantNote.trim(), selected.notes ?? ""]
        .filter(Boolean)
        .join("\n\n");

      await updateFinanceInstallment({
        id: selected.id,
        status: "PENDING_REVIEW",
        notes: nextNote || null,
        reviewedBy: user?.id ?? null,
      });

      toast.success("Solicitação enviada de volta para a fila do financeiro.");
      setConsultantNote("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar para a fila do financeiro."
      );
    } finally {
      setReturningToFinance(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pendentes Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada do financeiro BPO para consultores e gerência.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/hub-os")}>
          Voltar ao Hub OS
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>2ª Parcela ({secondInstallmentItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
            {!loading && secondInstallmentItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma OS pendente de 2ª parcela.
              </p>
            )}
            {secondInstallmentItems.map(item => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left text-sm ${selectedKey === `second:${item.id}` ? "border-primary" : "border-border"}`}
                onClick={() => setSelectedKey(`second:${item.id}`)}
              >
                <p className="font-medium">
                  OS #{item.os_orders?.sale_number ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.os_orders?.client_name ?? "Sem cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Venc.: {item.due_date ?? "—"}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Cadastro Pendente ({registrationPendingItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
            {!loading && registrationPendingItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma OS em cadastro pendente.
              </p>
            )}
            {registrationPendingItems.map(item => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left text-sm ${selectedKey === `cadastro:${item.id}` ? "border-primary" : "border-border"}`}
                onClick={() => setSelectedKey(`cadastro:${item.id}`)}
              >
                <p className="font-medium">
                  OS #{item.os_orders?.sale_number ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.os_orders?.client_name ?? "Sem cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {labelFinanceStatus(item.status)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rejeitados ({rejectedItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
            {!loading && rejectedItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma OS rejeitada.
              </p>
            )}
            {rejectedItems.map(item => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left text-sm ${selectedKey === `rejected:${item.id}` ? "border-primary" : "border-border"}`}
                onClick={() => setSelectedKey(`rejected:${item.id}`)}
              >
                <p className="font-medium">
                  OS #{item.os_orders?.sale_number ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.os_orders?.client_name ?? "Sem cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {labelFinanceStatus(item.status)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected && (
            <p className="text-sm text-muted-foreground">
              Selecione uma OS para visualizar detalhes.
            </p>
          )}
          {selected && (
            <>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">OS:</span> #
                  {selected.os_orders?.sale_number}
                </p>
                <p>
                  <span className="font-medium">Cliente:</span>{" "}
                  {selected.os_orders?.client_name}
                </p>
                <p>
                  <span className="font-medium">Status:</span>{" "}
                  {labelFinanceStatus(selected.status)}
                </p>
                <p>
                  <span className="font-medium">Parcela:</span>{" "}
                  {selected.installment_no}/{selected.total_installments}
                </p>
                <p>
                  <span className="font-medium">Data 2ª parcela:</span>{" "}
                  {selected.due_date ?? "—"}
                </p>
                {selected.notes && (
                  <p>
                    <span className="font-medium">Observação:</span>{" "}
                    {selected.notes}
                  </p>
                )}
              </div>

              {selectedGroup === "second" && (
                <>
                  <div className="space-y-2">
                    <Label>Anexar comprovante 2ª parcela</Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={event =>
                        setFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                  <Button
                    onClick={handleSubmitSecondProof}
                    disabled={!file || sending}
                  >
                    {sending ? "Enviando..." : "Anexar comprovante 2/2"}
                  </Button>
                </>
              )}

              {(selectedGroup === "cadastro" ||
                selectedGroup === "rejected") && (
                <>
                  <div className="space-y-2">
                    <Label>Atualização do consultor (opcional)</Label>
                    <Input
                      placeholder="Descreva o que foi ajustado para o financeiro revisar"
                      value={consultantNote}
                      onChange={event => setConsultantNote(event.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleReturnToFinanceQueue}
                    disabled={returningToFinance}
                  >
                    {returningToFinance
                      ? "Enviando para o financeiro..."
                      : "Confirmar atualização e enviar ao financeiro"}
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
