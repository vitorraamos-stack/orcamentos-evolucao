import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ComprovantePreviewDialog } from "@/components/financeiro/ComprovantePreviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchFinanceQueue,
  updateFinanceInstallment,
} from "@/features/hubos/finance";
import type {
  FinanceInstallment,
  FinanceInstallmentStatus,
} from "@/features/hubos/types";
import { useAuth } from "@/contexts/AuthContext";
import { labelFinanceStatus } from "@/lib/financeStatusLabels";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { cn } from "@/lib/utils";

const FILTERS: {
  label: string;
  value: "pending" | "done" | "rejected" | "cadastro";
}[] = [
  { label: "Pendentes", value: "pending" },
  { label: "Concluídos", value: "done" },
  { label: "Rejeitados", value: "rejected" },
  { label: "Cadastro pendente", value: "cadastro" },
];

const FILTER_STATUSES: Record<
  (typeof FILTERS)[number]["value"],
  FinanceInstallmentStatus[]
> = {
  pending: ["PENDING_REVIEW"],
  done: ["CONCILIADO", "LANCADO"],
  rejected: ["REJEITADO"],
  cadastro: ["CADASTRO_PENDENTE"],
};

export default function FinanceiroPortalPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FinanceInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]["value"]>("pending");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [savingStatus, setSavingStatus] =
    useState<FinanceInstallmentStatus | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRenderUrl, setPreviewRenderUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRenderUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewRenderUrl);
      }
    };
  }, [previewRenderUrl]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchFinanceQueue(FILTER_STATUSES[filter]);
      setItems(data);
      setSelectedId(current => current ?? data[0]?.id ?? null);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar a fila financeira.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter(item => {
      const sale = item.os_orders?.sale_number?.toLowerCase() ?? "";
      const client = item.os_orders?.client_name?.toLowerCase() ?? "";
      return sale.includes(normalized) || client.includes(normalized);
    });
  }, [items, search]);

  const selected = useMemo(
    () => filteredItems.find(item => item.id === selectedId) ?? null,
    [filteredItems, selectedId]
  );

  const filteredCountLabel = `${filteredItems.length}/${items.length}`;
  const hasItems = items.length > 0;
  const hasFiltered = filteredItems.length > 0;

  const updateStatus = async (
    status: FinanceInstallmentStatus,
    requireNote = false
  ) => {
    if (!selected) return;
    if (requireNote && !notes.trim()) {
      toast.error("Preencha uma observação para continuar.");
      return;
    }

    try {
      setSavingStatus(status);
      await updateFinanceInstallment({
        id: selected.id,
        status,
        notes: notes.trim() || null,
        reviewedBy: user?.id ?? null,
      });
      toast.success("Status atualizado.");
      setNotes("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar status da parcela."
      );
    } finally {
      setSavingStatus(null);
    }
  };

  const openComprovantePreview = async (
    asset: FinanceInstallment["os_order_assets"]
  ) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    if (previewRenderUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewRenderUrl);
    }
    setPreviewRenderUrl(null);
    setPreviewName(asset?.original_name ?? "Comprovante");

    try {
      if (!asset?.object_path) {
        setPreviewError("Comprovante indisponível.");
        return;
      }

      const data = await invokeEdgeFunction<{ downloadUrl: string }>(
        supabase,
        "r2-presign-download",
        {
          key: asset.object_path,
        }
      );

      const previewData = await invokeEdgeFunction<{ downloadUrl: string }>(
        supabase,
        "r2-presign-download",
        {
          key: asset.object_path,
          filename: asset.original_name ?? undefined,
          forPreview: true,
        }
      );

      if (!data?.downloadUrl || !previewData?.downloadUrl) {
        setPreviewError("Não foi possível gerar a URL do comprovante.");
        return;
      }

      setPreviewUrl(data.downloadUrl);
      setPreviewRenderUrl(previewData.downloadUrl);
    } catch (error) {
      console.error(error);
      setPreviewError(
        "Falha ao carregar comprovante. Tente novamente em instantes."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            Portal Financeiro (BPO) ({filteredCountLabel})
          </h2>
          <p className="text-sm text-muted-foreground">
            Fila de conferência de comprovantes com ações de conciliação.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            {FILTERS.map(item => (
              <Button
                key={item.value}
                variant={filter === item.value ? "default" : "outline"}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {loading ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Carregando...
              </Card>
            ) : !hasItems ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhum item na fila financeira.
              </Card>
            ) : !hasFiltered ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhum resultado para sua busca.
              </Card>
            ) : (
              filteredItems.map(item => {
                const isSelected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "hover:border-muted-foreground/40 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        OS #{item.os_orders?.sale_number ?? "—"} -{" "}
                        {item.os_orders?.client_name ?? "Sem cliente"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">
                        {labelFinanceStatus(item.status)}
                      </Badge>
                      <Badge variant="outline">
                        Parcela {item.installment_no}/{item.total_installments}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <Card className="flex-1 p-5">
          {!selected ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              Selecione um item para revisar.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold">
                    OS #{selected.os_orders?.sale_number} -{" "}
                    {selected.os_orders?.client_name}
                  </h3>
                  <Badge variant="outline">
                    {new Date(selected.created_at).toLocaleDateString("pt-BR")}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {labelFinanceStatus(selected.status)}
                  </Badge>
                  <Badge variant="outline">
                    Parcela {selected.installment_no}/
                    {selected.total_installments}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Comprovante
                  </p>
                  {selected.os_order_assets ? (
                    <button
                      type="button"
                      className="text-sm text-primary underline"
                      onClick={() =>
                        openComprovantePreview(selected.os_order_assets)
                      }
                    >
                      {selected.os_order_assets.original_name ??
                        selected.os_order_assets.object_path}
                    </button>
                  ) : (
                    <p className="text-muted-foreground">(não anexado)</p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Criado em
                  </p>
                  <p>{new Date(selected.created_at).toLocaleString("pt-BR")}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={Boolean(savingStatus)}
                  onClick={() => updateStatus("CONCILIADO")}
                >
                  Conciliado
                </Button>
                <Button
                  disabled={Boolean(savingStatus)}
                  variant="secondary"
                  onClick={() => updateStatus("LANCADO")}
                >
                  Lançado
                </Button>
                <Button
                  disabled={Boolean(savingStatus)}
                  variant="destructive"
                  onClick={() => updateStatus("REJEITADO", true)}
                >
                  Rejeitado
                </Button>
                <Button
                  disabled={Boolean(savingStatus)}
                  variant="outline"
                  onClick={() => updateStatus("CADASTRO_PENDENTE", true)}
                >
                  Cadastro Pendente
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ComprovantePreviewDialog
        open={previewOpen}
        onOpenChange={open => {
          setPreviewOpen(open);
          if (!open) {
            if (previewRenderUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(previewRenderUrl);
            }
            setPreviewRenderUrl(null);
            setPreviewUrl(null);
            setPreviewError(null);
          }
        }}
        url={previewUrl}
        previewUrl={previewRenderUrl}
        filename={previewName}
        loading={previewLoading}
        error={previewError}
      />
    </div>
  );
}
