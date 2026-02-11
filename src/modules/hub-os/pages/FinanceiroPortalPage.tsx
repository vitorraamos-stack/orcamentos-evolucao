import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ComprovantePreviewDialog } from "@/components/financeiro/ComprovantePreviewDialog";
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

const getFileExtension = (filename?: string | null) => {
  if (!filename || !filename.includes(".")) return null;
  return filename.split(".").pop()?.toLowerCase() ?? null;
};

const isPreviewBlobLikelyInvalid = (blob: Blob, filename?: string | null) => {
  const extension = getFileExtension(filename);

  if (!extension) {
    return blob.size === 0;
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(extension)) {
    return (
      blob.size === 0 ||
      (!blob.type.startsWith("image/") &&
        blob.type !== "application/octet-stream")
    );
  }

  if (extension === "pdf") {
    return (
      blob.size === 0 ||
      (!blob.type.includes("pdf") && blob.type !== "application/octet-stream")
    );
  }

  return blob.size === 0;
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

      try {
        const response = await fetch(previewData.downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();

        if (isPreviewBlobLikelyInvalid(blob, asset.original_name)) {
          setPreviewError(
            "O arquivo retornado não pôde ser renderizado como comprovante. Verifique se o objeto no R2 está íntegro."
          );
          return;
        }

        setPreviewRenderUrl(URL.createObjectURL(blob));
      } catch (blobError) {
        console.warn("Falha ao criar preview por blob.", blobError);
        setPreviewError(
          "Não foi possível carregar a pré-visualização deste comprovante. Você ainda pode baixar ou abrir em nova aba."
        );
      }
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Portal Financeiro (BPO)</h1>
        <p className="text-sm text-muted-foreground">
          Fila de conferência de comprovantes com ações de conciliação.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(item => (
          <Button
            key={item.value}
            variant={filter === item.value ? "default" : "outline"}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
        <Input
          placeholder="Buscar OS/cliente"
          className="ml-auto max-w-xs"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Itens ({filteredItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            )}
            {!loading && filteredItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum item encontrado.
              </p>
            )}
            {filteredItems.map(item => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left text-sm ${selectedId === item.id ? "border-primary" : "border-border"}`}
                onClick={() => setSelectedId(item.id)}
              >
                <p className="font-medium">
                  OS #{item.os_orders?.sale_number ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.os_orders?.client_name ?? "Sem cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Parcela {item.installment_no}/{item.total_installments} •{" "}
                  {labelFinanceStatus(item.status)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhe da conferência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <p className="text-sm text-muted-foreground">
                Selecione um item para revisar.
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
                    <span className="font-medium">Parcela:</span>{" "}
                    {selected.installment_no}/{selected.total_installments}
                  </p>
                  <p>
                    <span className="font-medium">Status:</span>{" "}
                    {labelFinanceStatus(selected.status)}
                  </p>
                  <p>
                    <span className="font-medium">Criado em:</span>{" "}
                    {new Date(selected.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                {selected.os_order_assets && (
                  <button
                    type="button"
                    className="text-sm text-primary underline"
                    onClick={() =>
                      openComprovantePreview(selected.os_order_assets)
                    }
                  >
                    Comprovante:{" "}
                    {selected.os_order_assets.original_name ??
                      selected.os_order_assets.object_path}
                  </button>
                )}

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
              </>
            )}
          </CardContent>
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
