import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchFinanceQueue,
  fetchPendingSecondInstallments,
  updateFinanceInstallment,
} from "@/features/hubos/finance";
import type { FinanceInstallment } from "@/features/hubos/types";
import { uploadReceiptForOrder } from "@/features/hubos/assets";
import { useAuth } from "@/contexts/AuthContext";
import { labelFinanceStatus } from "@/lib/financeStatusLabels";
import {
  summarizeConsultantFinancePending,
  type ConsultantFinancePendingGroup,
} from "@/features/hubos/financePending";

type Item = {
  key: string;
  group: ConsultantFinancePendingGroup;
  value: FinanceInstallment;
};
type Filter = "all" | ConsultantFinancePendingGroup;
const groupLabel: Record<ConsultantFinancePendingGroup, string> = {
  second_installment: "2ª Parcela",
  registration: "Cadastro Pendente",
  rejected: "Rejeitado",
};
const formatDate = (value?: string | null) =>
  value
    ? new Date(
        value.includes("T") ? value : `${value}T12:00:00`
      ).toLocaleDateString("pt-BR")
    : "—";
const noteHistory = (existing: string | null, status: string, note: string) =>
  [
    existing?.trim(),
    `[${new Date().toLocaleString("pt-BR")}] CONSULTOR • ${status}\n${note.trim()}`.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

export default function OsPendentesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [second, registration, rejected] = await Promise.all([
        fetchPendingSecondInstallments(),
        fetchFinanceQueue(["CADASTRO_PENDENTE"]),
        fetchFinanceQueue(["REJEITADO"]),
      ]);
      const next: Item[] = [
        ...second.map(value => ({
          key: `second:${value.id}`,
          group: "second_installment" as const,
          value,
        })),
        ...registration.map(value => ({
          key: `registration:${value.id}`,
          group: "registration" as const,
          value,
        })),
        ...rejected.map(value => ({
          key: `rejected:${value.id}`,
          group: "rejected" as const,
          value,
        })),
      ];
      setItems(next);
      setSelectedKey(current =>
        next.some(item => item.key === current)
          ? current
          : (next[0]?.key ?? null)
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as pendências."
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const summary = summarizeConsultantFinancePending(
    items.map(({ value }) => value)
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return items.filter(
      item =>
        (filter === "all" || item.group === filter) &&
        (!term ||
          [
            item.value.os_orders?.sale_number,
            item.value.os_orders?.client_name,
          ].some(value =>
            String(value ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(term)
          ))
    );
  }, [items, filter, search]);
  const selected = items.find(item => item.key === selectedKey) ?? null;

  const upload = async () => {
    if (!selected?.value.os_orders?.id || !file || busy) return;
    setBusy(true);
    try {
      await uploadReceiptForOrder({
        osId: selected.value.os_orders.id,
        file,
        userId: user?.id ?? null,
        installmentLabel: "2/2",
      });
      toast.success("Comprovante 2/2 anexado com sucesso.");
      setFile(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao anexar comprovante 2/2."
      );
    } finally {
      setBusy(false);
    }
  };
  const returnToFinance = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const label =
      selected.group === "registration"
        ? "Cadastro corrigido"
        : "Ajuste concluído";
    try {
      await updateFinanceInstallment({
        id: selected.value.id,
        status: "PENDING_REVIEW",
        notes: noteHistory(selected.value.notes, label, note),
        reviewedBy: user?.id ?? null,
      });
      toast.success("Solicitação enviada de volta para a fila do financeiro.");
      setNote("");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar ao Financeiro."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Pendências Financeiras</h1>
          <p className="text-sm text-muted-foreground">
            Pendências que precisam de ação do Comercial antes de retornar ao
            Financeiro.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </header>
      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-[32rem]" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["Total", summary.totalOrders],
              ["2ª parcela", summary.secondInstallments],
              ["Cadastro pendente", summary.registrationPending],
              ["Rejeitados", summary.rejected],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por OS ou cliente..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    ["all", "Todas"],
                    ["second_installment", "2ª parcela"],
                    ["registration", "Cadastro pendente"],
                    ["rejected", "Rejeitados"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={filter === value ? "default" : "outline"}
                      onClick={() => setFilter(value as Filter)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="max-h-[60vh] space-y-2 overflow-auto">
                  {visible.length === 0 && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Nenhuma pendência para este filtro.
                    </p>
                  )}
                  {visible.map(item => (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => {
                        setSelectedKey(item.key);
                        setFile(null);
                        setNote("");
                      }}
                      className={`w-full rounded-lg border p-3 text-left hover:bg-muted/40 ${selectedKey === item.key ? "border-primary bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong>
                          OS #{item.value.os_orders?.sale_number ?? "—"}
                        </strong>
                        <Badge
                          variant={
                            item.group === "rejected"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {groupLabel[item.group]}
                        </Badge>
                      </div>
                      <p className="text-sm">
                        {item.value.os_orders?.client_name ?? "Sem cliente"}
                      </p>
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                        <span>{labelFinanceStatus(item.value.status)}</span>
                        <span>
                          {item.value.due_date
                            ? `Venc. ${formatDate(item.value.due_date)}`
                            : ""}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-5 p-5">
                {!selected ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Selecione uma OS para visualizar detalhes.
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">
                          OS #{selected.value.os_orders?.sale_number}
                        </h2>
                        <p className="text-muted-foreground">
                          {selected.value.os_orders?.client_name}
                        </p>
                      </div>
                      <Badge
                        variant={
                          selected.group === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {groupLabel[selected.group]}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Parcela</dt>
                        <dd>
                          {selected.value.installment_no}/
                          {selected.value.total_installments}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Vencimento</dt>
                        <dd>{formatDate(selected.value.due_date)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd>{labelFinanceStatus(selected.value.status)}</dd>
                      </div>
                    </dl>
                    {selected.value.notes && (
                      <section>
                        <h3 className="text-sm font-semibold">
                          Observações / histórico
                        </h3>
                        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
                          {selected.value.notes}
                        </div>
                      </section>
                    )}
                    <Button asChild variant="outline">
                      <Link href={`/os/${selected.value.os_id}`}>Abrir OS</Link>
                    </Button>
                    {selected.group === "second_installment" && (
                      <section className="space-y-3 border-t pt-4">
                        <Label htmlFor="proof">
                          Anexar comprovante da 2ª parcela
                        </Label>
                        <Input
                          id="proof"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={e => setFile(e.target.files?.[0] ?? null)}
                        />
                        {file && (
                          <p className="text-sm text-muted-foreground">
                            Arquivo: {file.name}
                          </p>
                        )}
                        <Button
                          disabled={!file || busy}
                          onClick={() => void upload()}
                        >
                          {busy ? "Enviando..." : "Enviar comprovante"}
                        </Button>
                      </section>
                    )}
                    {(selected.group === "registration" ||
                      selected.group === "rejected") && (
                      <section className="space-y-3 border-t pt-4">
                        <Label htmlFor="note">
                          Atualização do consultor (opcional)
                        </Label>
                        <Textarea
                          id="note"
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          placeholder="Descreva o que foi ajustado para o Financeiro revisar"
                        />
                        <Button
                          disabled={busy}
                          onClick={() => void returnToFinance()}
                        >
                          {busy
                            ? "Enviando..."
                            : selected.group === "registration"
                              ? "Cadastro corrigido — reenviar ao Financeiro"
                              : "Ajuste concluído — reenviar ao Financeiro"}
                        </Button>
                      </section>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
