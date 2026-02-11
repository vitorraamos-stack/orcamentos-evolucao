import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

type PreviewCacheEntry = {
  downloadUrl: string;
  previewUrl: string;
  expiresAt: number;
};

const getFileType = (filename?: string | null) => {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (!ext) return "other" as const;
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
    return "image" as const;
  }
  if (ext === "pdf") return "pdf" as const;
  return "other" as const;
};

export default function FinanceiroPortalPage() {
  const { user } = useAuth();
  const cacheRef = useRef<Map<string, PreviewCacheEntry>>(new Map());
  const requestRef = useRef(0);

  const [items, setItems] = useState<FinanceInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]["value"]>("pending");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [savingStatus, setSavingStatus] =
    useState<FinanceInstallmentStatus | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRenderUrl, setPreviewRenderUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  const loadComprovantePreview = async (
    asset: FinanceInstallment["os_order_assets"]
  ) => {
    requestRef.current += 1;
    const reqId = requestRef.current;

    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewRenderUrl(null);
    setPreviewName(asset?.original_name ?? "Comprovante");

    if (!asset?.object_path) {
      setPreviewError("Comprovante indisponível.");
      return;
    }

    const cached = cacheRef.current.get(asset.object_path);
    if (cached && cached.expiresAt > Date.now()) {
      setPreviewUrl(cached.downloadUrl);
      setPreviewRenderUrl(cached.previewUrl);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    try {
      const [downloadData, previewData] = await Promise.all([
        invokeEdgeFunction<{ downloadUrl: string }>(
          supabase,
          "r2-presign-download",
          { key: asset.object_path }
        ),
        invokeEdgeFunction<{ downloadUrl: string }>(
          supabase,
          "r2-presign-download",
          {
            key: asset.object_path,
            filename: asset.original_name ?? undefined,
            forPreview: true,
          }
        ),
      ]);

      if (reqId !== requestRef.current) return;

      if (!downloadData?.downloadUrl || !previewData?.downloadUrl) {
        setPreviewError("Não foi possível gerar a URL do comprovante.");
        return;
      }

      const entry: PreviewCacheEntry = {
        downloadUrl: downloadData.downloadUrl,
        previewUrl: previewData.downloadUrl,
        expiresAt: Date.now() + 8 * 60 * 1000,
      };
      cacheRef.current.set(asset.object_path, entry);

      setPreviewUrl(entry.downloadUrl);
      setPreviewRenderUrl(entry.previewUrl);
    } catch (error) {
      if (reqId !== requestRef.current) return;
      console.error(error);
      setPreviewError(
        "Falha ao carregar comprovante. Você ainda pode tentar abrir em nova aba."
      );
    } finally {
      if (reqId === requestRef.current) {
        setPreviewLoading(false);
      }
    }
  };

  useEffect(() => {
    setNotes("");
    if (!selected) {
      setPreviewName(null);
      setPreviewUrl(null);
      setPreviewRenderUrl(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    void loadComprovantePreview(selected.os_order_assets);
  }, [selected?.id]);

  const fileType = getFileType(previewName);

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

      <div className="grid gap-4 lg:grid-cols-[360px,1fr,420px]">
        <div className="flex flex-col gap-2">
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
                    <div className="text-sm font-semibold">
                      OS #{item.os_orders?.sale_number ?? "—"} -{" "}
                      {item.os_orders?.client_name ?? "Sem cliente"}
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

        <Card className="p-5">
          {!selected ? (
            <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
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
                  <p className="text-sm">{previewName ?? "—"}</p>
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

        <Card className="flex min-h-[560px] flex-col overflow-hidden p-0">
          <div className="border-b px-4 py-3">
            <p className="font-medium">Preview do comprovante</p>
          </div>

          <div className="min-h-0 flex-1 bg-muted/20">
            {previewLoading && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Carregando comprovante...
              </div>
            )}

            {!previewLoading && previewError && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-sm text-destructive">{previewError}</p>
              </div>
            )}

            {!previewLoading &&
              !previewError &&
              previewRenderUrl &&
              fileType === "image" && (
                <div className="flex h-full items-center justify-center overflow-auto p-3">
                  <img
                    src={previewRenderUrl}
                    alt={previewName ?? "Comprovante"}
                    className="max-h-full w-auto object-contain"
                  />
                </div>
              )}

            {!previewLoading &&
              !previewError &&
              previewRenderUrl &&
              fileType === "pdf" && (
                <iframe
                  src={previewRenderUrl}
                  title={previewName ?? "Comprovante PDF"}
                  className="h-full w-full"
                />
              )}

            {!previewLoading && !previewError && !previewRenderUrl && (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Sem preview disponível para o item selecionado.
              </div>
            )}

            {!previewLoading &&
              !previewError &&
              previewRenderUrl &&
              fileType === "other" && (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  Pré-visualização indisponível para este formato.
                </div>
              )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={!previewUrl}
              onClick={() => {
                if (!previewUrl) return;
                const a = document.createElement("a");
                a.href = previewUrl;
                if (previewName) a.download = previewName;
                a.rel = "noreferrer";
                a.click();
              }}
            >
              Baixar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!previewUrl}
              onClick={() =>
                previewUrl && window.open(previewUrl, "_blank", "noreferrer")
              }
            >
              Abrir em nova aba
            </Button>
          </div>
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
