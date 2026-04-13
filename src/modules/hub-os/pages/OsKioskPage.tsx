import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  fetchLatestOrderLayout,
  fetchOrderAssetDownloadUrl,
} from "@/features/hubos/api";
import {
  fetchKioskBoard,
  completeKioskInstallation,
  moveKioskOrder,
  registerKioskOrderByCode,
} from "../kiosk/api";
import {
  KIOSK_CRITICAL_STALE_AFTER_MS,
  KIOSK_MOVE_CTA_LABELS,
  KIOSK_POLL_INTERVAL_MS,
  KIOSK_STAGE_LABELS,
  KIOSK_STALE_AFTER_MS,
} from "../kiosk/constants";
import { KioskOsLookupPanel } from "../kiosk/KioskOsLookupPanel";
import { useOnlineStatus } from "../kiosk/hooks";
import {
  applyMoveResult,
  getOrCreateTerminalId,
  getKioskErrorKind,
  isUpstreamFinalized,
  parseKioskError,
  resolveMoveAction,
  resolveKioskHealthState,
  shouldApplySyncResponse,
  shouldBlockKioskMutations,
  upsertCard,
} from "../kiosk/utils";
import type {
  KioskBoardCard,
  KioskErrorKind,
  KioskHealthState,
  KioskMoveAction,
} from "../kiosk/types";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";
import { useGlobalOrderFlowState } from "../order-flow-state";
import { filterKioskActiveCards } from "../order-flow-selectors";

type KioskSummaryCategory = "instalacoes" | "pronto_avisar" | "logistica";

const toTagLabel = (mode: string | null) => {
  const normalized = (mode ?? "").toLowerCase();
  if (normalized.includes("entrega")) return "Entrega";
  if (normalized.includes("retirada")) return "Retirada";
  return "Instalação";
};

const formatDatePtBr = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
};

const getHeadline = (order: KioskBoardCard) => {
  const display = String(order.os_number ?? order.sale_number ?? "").trim();
  const title = (
    order.title ?? `${order.sale_number ?? ""} - ${order.client_name ?? ""}`
  ).trim();
  return display ? `${display} - ${title}` : title || "Sem título";
};

export default function OsKioskPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<KioskBoardCard | null>(
    null
  );
  const [selectedOrderLayout, setSelectedOrderLayout] =
    useState<OsOrderLayoutAsset | null>(null);
  const [loadingSelectedLayout, setLoadingSelectedLayout] = useState(false);
  const [openingSelectedLayout, setOpeningSelectedLayout] = useState(false);
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [installationDialogOrder, setInstallationDialogOrder] =
    useState<KioskBoardCard | null>(null);
  const [installationFeedback, setInstallationFeedback] = useState("");
  const [isCompletingInstallation, setIsCompletingInstallation] = useState(false);
  const [summaryModalCategory, setSummaryModalCategory] =
    useState<KioskSummaryCategory | null>(null);
  const [summarySearch, setSummarySearch] = useState("");
  const [summarySelectedKey, setSummarySelectedKey] = useState<string | null>(
    null
  );
  const [summarySelectedLayout, setSummarySelectedLayout] =
    useState<OsOrderLayoutAsset | null>(null);
  const [loadingSummaryLayout, setLoadingSummaryLayout] = useState(false);
  const [openingSummaryLayout, setOpeningSummaryLayout] = useState(false);
  const [cards, setCards] = useState<KioskBoardCard[]>([]);
  const { isRetirado } = useGlobalOrderFlowState();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [healthErrorKind, setHealthErrorKind] = useState<KioskErrorKind | null>(
    null
  );
  const syncRequestSeqRef = useRef(0);
  const appliedSyncSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const realtimeRefetchTimerRef = useRef<number | null>(null);

  const activeCards = useMemo(
    () => filterKioskActiveCards(cards, isRetirado, isUpstreamFinalized),
    [cards, isRetirado]
  );

  const listaOSAcabamentoEntregaRetirada = useMemo(
    () =>
      activeCards.filter(
        card => card.current_stage === "acabamento_entrega_retirada"
      ),
    [activeCards]
  );
  const listaOSAcabamentoInstalacao = useMemo(
    () =>
      activeCards.filter(
        card => card.current_stage === "acabamento_instalacao"
      ),
    [activeCards]
  );
  const listaOSEmbalagem = useMemo(
    () => activeCards.filter(card => card.current_stage === "embalagem"),
    [activeCards]
  );
  const listaInstalacoes = useMemo(
    () => activeCards.filter(card => card.current_stage === "instalacoes"),
    [activeCards]
  );
  const listaProntoAvisar = useMemo(
    () => activeCards.filter(card => card.current_stage === "pronto_avisar"),
    [activeCards]
  );
  const listaLogistica = useMemo(
    () => activeCards.filter(card => card.current_stage === "logistica"),
    [activeCards]
  );

  const attemptFullscreen = async () => {
    if (document.fullscreenElement) {
      setFullscreenBlocked(false);
      return;
    }

    try {
      await document.documentElement.requestFullscreen();
      setFullscreenBlocked(false);
    } catch {
      setFullscreenBlocked(true);
    }
  };

  useEffect(() => {
    void attemptFullscreen();
  }, []);

  useEffect(() => {
    setTerminalId(getOrCreateTerminalId());
  }, []);

  const syncBoard = useCallback(async (opts?: { silent?: boolean }) => {
    const requestSeq = ++syncRequestSeqRef.current;
    if (!opts?.silent) setIsSyncing(true);

    try {
      const list = await fetchKioskBoard();
      if (
        !shouldApplySyncResponse({
          requestSeq,
          appliedSeq: appliedSyncSeqRef.current,
        })
      ) {
        return;
      }
      appliedSyncSeqRef.current = requestSeq;
      setCards(list);
      setSyncError(null);
      setHealthErrorKind(null);
      setLastSyncAt(new Date().toISOString());
    } catch (error) {
      if (
        !shouldApplySyncResponse({
          requestSeq,
          appliedSeq: appliedSyncSeqRef.current,
        })
      ) {
        return;
      }
      appliedSyncSeqRef.current = requestSeq;
      setSyncError(parseKioskError(error));
      setHealthErrorKind(getKioskErrorKind(error));
    } finally {
      if (!opts?.silent && isMountedRef.current) setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!terminalId) return;

    void syncBoard();
    const interval = window.setInterval(() => {
      void syncBoard({ silent: true });
    }, KIOSK_POLL_INTERVAL_MS);

    const onFocus = () => void syncBoard({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncBoard({ silent: true });
      }
    };
    const onOnline = () => void syncBoard({ silent: true });

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [terminalId, syncBoard]);

  useEffect(() => {
    if (!terminalId) return;

    const scheduleRealtimeRefresh = () => {
      if (realtimeRefetchTimerRef.current) {
        window.clearTimeout(realtimeRefetchTimerRef.current);
      }
      realtimeRefetchTimerRef.current = window.setTimeout(() => {
        realtimeRefetchTimerRef.current = null;
        void syncBoard({ silent: true });
      }, 180);
    };

    const channel = supabase
      .channel("kiosk-board-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_kiosk_board",
        },
        () => {
          scheduleRealtimeRefresh();
        }
      )
      .subscribe(status => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          scheduleRealtimeRefresh();
        }
      });

    return () => {
      if (realtimeRefetchTimerRef.current) {
        window.clearTimeout(realtimeRefetchTimerRef.current);
        realtimeRefetchTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [terminalId, syncBoard]);

  const healthState: KioskHealthState = resolveKioskHealthState({
    isOnline,
    isSyncing,
    lastSyncAt,
    lastErrorKind: healthErrorKind,
    staleAfterMs: KIOSK_STALE_AFTER_MS,
  });
  const isMutationBlocked = shouldBlockKioskMutations({
    healthState,
    lastSyncAt,
    criticalStaleAfterMs: KIOSK_CRITICAL_STALE_AFTER_MS,
  });

  const handleAddByCode = async (sanitizedCode: string) => {
    if (isMutationBlocked) {
      throw new Error(
        "Quiosque em modo degradado/offline. Sincronize novamente antes de registrar novas OS."
      );
    }

    if (!terminalId) throw new Error("Terminal não inicializado.");

    const created = await registerKioskOrderByCode({
      lookupCode: sanitizedCode,
      actorId: user?.id ?? null,
      terminalId,
    });

    setCards(prev => upsertCard(prev, created));
    setHealthErrorKind(null);
    setAddModalOpen(false);
    setLastSyncAt(new Date().toISOString());
    toast.success(
      `OS #${created.os_number ?? created.sale_number ?? "—"} adicionada ao quiosque.`
    );
  };

  const closeInstallationDialog = () => {
    if (isCompletingInstallation) return;
    setInstallationDialogOrder(null);
    setInstallationFeedback("");
  };

  const handleCompleteInstallation = async () => {
    const order = installationDialogOrder;
    const feedback = installationFeedback.trim();

    if (!order) return;

    if (isMutationBlocked) {
      toast.error(
        "Quiosque em estado inseguro. Atualize a sincronização antes de finalizar instalação."
      );
      return;
    }

    if (!terminalId) {
      toast.error("Terminal não inicializado.");
      return;
    }

    if (!feedback) {
      toast.error("O feedback é obrigatório para finalizar a instalação.");
      return;
    }

    try {
      setProcessingId(order.order_key);
      setIsCompletingInstallation(true);
      const result = await completeKioskInstallation({
        orderKey: order.order_key,
        feedback,
        actorId: user?.id ?? null,
        terminalId,
      });

      setCards(prev => applyMoveResult(prev, result));
      setSelectedOrder(current =>
        current?.order_key === order.order_key ? null : current
      );
      setDetailsOpen(false);
      setLastSyncAt(new Date().toISOString());
      setSyncError(null);
      setHealthErrorKind(null);
      closeInstallationDialog();
      toast.success(result.result_message || "Instalação finalizada com sucesso.");
    } catch (error) {
      setHealthErrorKind(getKioskErrorKind(error));
      toast.error(parseKioskError(error));
    } finally {
      setIsCompletingInstallation(false);
      setProcessingId(null);
    }
  };

  const runMove = async (order: KioskBoardCard, action: KioskMoveAction) => {
    if (isMutationBlocked) {
      toast.error(
        "Quiosque em estado inseguro. Atualize a sincronização antes de movimentar OS."
      );
      return;
    }

    if (!terminalId) {
      toast.error("Terminal não inicializado.");
      return;
    }

    try {
      setProcessingId(order.order_key);
      const result = await moveKioskOrder({
        orderKey: order.order_key,
        action,
        actorId: user?.id ?? null,
        terminalId,
      });

      setCards(prev => applyMoveResult(prev, result));
      setSelectedOrder(current =>
        current?.order_key === order.order_key && !result.removed
          ? result
          : current
      );
      if (result.removed) {
        setSelectedOrder(current =>
          current?.order_key === order.order_key ? null : current
        );
      }
      setLastSyncAt(new Date().toISOString());
      setSyncError(null);
      setHealthErrorKind(null);
      toast.success(result.result_message || "Movimentação concluída.");
    } catch (error) {
      setHealthErrorKind(getKioskErrorKind(error));
      toast.error(parseKioskError(error));
    } finally {
      setProcessingId(null);
    }
  };

  const totalCards = activeCards.length;

  const AddOrderButton = ({ label }: { label: string }) => (
    <button
      type="button"
      className="group flex min-h-11 items-center gap-3 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-left transition hover:bg-primary/20"
      disabled={isMutationBlocked}
      onClick={() => setAddModalOpen(true)}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
        +
      </span>
      <span className="text-sm font-bold tracking-wide text-primary sm:text-base">
        {label}
      </span>
    </button>
  );

  const kioskSummaryConfig: Record<
    KioskSummaryCategory,
    { title: string; orders: KioskBoardCard[] }
  > = {
    instalacoes: { title: "Instalações", orders: listaInstalacoes },
    pronto_avisar: { title: "Pronto/Avisar", orders: listaProntoAvisar },
    logistica: { title: "Logística", orders: listaLogistica },
  };

  const summaryModalData = summaryModalCategory
    ? kioskSummaryConfig[summaryModalCategory]
    : null;

  const summaryFilteredOrders = useMemo(() => {
    if (!summaryModalData) return [];
    const search = summarySearch.trim().toLowerCase();
    if (!search) return summaryModalData.orders;

    return summaryModalData.orders.filter(order => {
      const orderNumber = String(
        order.os_number ?? order.sale_number ?? ""
      ).toLowerCase();
      return (
        orderNumber.includes(search) ||
        (order.title ?? "").toLowerCase().includes(search) ||
        (order.description ?? "").toLowerCase().includes(search) ||
        (order.client_name ?? "").toLowerCase().includes(search)
      );
    });
  }, [summaryModalData, summarySearch]);

  useEffect(() => {
    if (!summaryModalData) {
      setSummarySelectedKey(null);
      return;
    }

    if (
      summarySelectedKey &&
      summaryFilteredOrders.some(
        order => order.order_key === summarySelectedKey
      )
    ) {
      return;
    }

    setSummarySelectedKey(summaryFilteredOrders[0]?.order_key ?? null);
  }, [summaryFilteredOrders, summaryModalData, summarySelectedKey]);

  const summarySelectedOrder = useMemo(
    () =>
      summaryFilteredOrders.find(
        order => order.order_key === summarySelectedKey
      ) ?? null,
    [summaryFilteredOrders, summarySelectedKey]
  );

  useEffect(() => {
    let active = true;
    const loadSelectedOrderLayout = async () => {
      if (
        !detailsOpen ||
        !selectedOrder ||
        selectedOrder.source_type !== "os_orders"
      ) {
        if (active) {
          setSelectedOrderLayout(null);
          setLoadingSelectedLayout(false);
        }
        return;
      }

      try {
        if (active) setLoadingSelectedLayout(true);
        const layout = await fetchLatestOrderLayout(selectedOrder.source_id);
        if (active) setSelectedOrderLayout(layout);
      } catch (error) {
        console.error(error);
        if (active) setSelectedOrderLayout(null);
      } finally {
        if (active) setLoadingSelectedLayout(false);
      }
    };

    void loadSelectedOrderLayout();
    return () => {
      active = false;
    };
  }, [detailsOpen, selectedOrder]);

  useEffect(() => {
    let active = true;
    const loadSummaryLayout = async () => {
      if (
        !summaryModalData ||
        !summarySelectedOrder ||
        summarySelectedOrder.source_type !== "os_orders"
      ) {
        if (active) {
          setSummarySelectedLayout(null);
          setLoadingSummaryLayout(false);
        }
        return;
      }

      try {
        if (active) setLoadingSummaryLayout(true);
        const layout = await fetchLatestOrderLayout(summarySelectedOrder.source_id);
        if (active) setSummarySelectedLayout(layout);
      } catch (error) {
        console.error(error);
        if (active) setSummarySelectedLayout(null);
      } finally {
        if (active) setLoadingSummaryLayout(false);
      }
    };

    void loadSummaryLayout();
    return () => {
      active = false;
    };
  }, [summaryModalData, summarySelectedOrder]);

  const openLayout = async (
    layout: OsOrderLayoutAsset | null,
    setOpening: (value: boolean) => void
  ) => {
    if (!layout?.object_path) {
      toast.error("Layout indisponível.");
      return;
    }
    try {
      setOpening(true);
      const downloadUrl = await fetchOrderAssetDownloadUrl(
        layout.object_path,
        layout.original_name ?? undefined
      );
      window.open(downloadUrl, "_blank", "noreferrer");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Falha ao abrir layout."
      );
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    setSummarySearch("");
    setSummarySelectedKey(null);
  }, [summaryModalCategory]);

  const renderOrderCard = (
    order: KioskBoardCard,
    children?: ReactNode,
    className?: string
  ) => (
    <Card
      key={order.order_key}
      role="button"
      tabIndex={0}
      onClick={() => {
        setSelectedOrder(order);
        setDetailsOpen(true);
      }}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setSelectedOrder(order);
        setDetailsOpen(true);
      }}
      className={`space-y-3 p-3 transition hover:border-primary/60 hover:bg-muted/20 ${className ?? ""}`}
    >
      <p className="text-xs text-muted-foreground">
        OS #{order.os_number ?? order.sale_number ?? "—"}
      </p>
      <p className="font-semibold">{order.title ?? getHeadline(order)}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{toTagLabel(order.delivery_mode)}</Badge>
      </div>
      {children}
    </Card>
  );

  const renderInstallationFinalizeButton = (order: KioskBoardCard) => {
    if (order.current_stage !== "instalacoes") return null;

    return (
      <Button
        variant="default"
        disabled={processingId === order.order_key || isMutationBlocked}
        onClick={event => {
          event.stopPropagation();
          setInstallationDialogOrder(order);
          setInstallationFeedback("");
        }}
      >
        Finalizar instalação
      </Button>
    );
  };

  const renderMoveButton = (order: KioskBoardCard) => {
    const action = resolveMoveAction({
      stage: order.current_stage,
      deliveryMode: order.delivery_mode,
    });
    if (!action) return null;

    return (
      <Button
        disabled={processingId === order.order_key || isMutationBlocked}
        onClick={event => {
          event.stopPropagation();
          void runMove(order, action);
        }}
      >
        {KIOSK_MOVE_CTA_LABELS[action]}
      </Button>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background p-4 sm:p-6 lg:p-8">
      {fullscreenBlocked ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>Clique para entrar em Tela Cheia</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void attemptFullscreen()}
          >
            Entrar em Tela Cheia
          </Button>
        </div>
      ) : null}

      <div
        className={
          addModalOpen
            ? "pointer-events-none select-none blur-[2px] brightness-75"
            : ""
        }
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Modo Quiosque</h1>
            <p className="text-sm text-muted-foreground">
              Acabamento e Embalagem em tela cheia.
            </p>
            <p className="text-xs text-muted-foreground">
              {healthState === "syncing"
                ? "Sincronizando..."
                : `Estado: ${healthState}`}
              {lastSyncAt
                ? ` • Última sincronização: ${new Date(lastSyncAt).toLocaleTimeString("pt-BR")}`
                : ""}
            </p>
            {syncError ? (
              <p className="text-xs text-amber-700">{syncError}</p>
            ) : null}
            {isMutationBlocked ? (
              <p className="text-xs text-red-700">
                Mutações bloqueadas até normalizar sync/conexão.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void syncBoard()}
              disabled={isSyncing}
            >
              Atualizar
            </Button>
            <Badge variant="secondary">{totalCards} OS em exibição</Badge>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSummaryModalCategory("instalacoes")}
            className="cursor-pointer p-3 transition hover:border-primary/60 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Instalações
              </h3>
              <Badge variant="outline">{listaInstalacoes.length}</Badge>
            </div>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSummaryModalCategory("pronto_avisar")}
            className="cursor-pointer p-3 transition hover:border-primary/60 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pronto/Avisar
              </h3>
              <Badge variant="outline">{listaProntoAvisar.length}</Badge>
            </div>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSummaryModalCategory("logistica")}
            className="cursor-pointer p-3 transition hover:border-primary/60 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Logística
              </h3>
              <Badge variant="outline">{listaLogistica.length}</Badge>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Acabamento</h2>
              <AddOrderButton label="ADICIONAR NOVA OS" />
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Entrega/Retirada
                  </h3>
                  <Badge variant="outline">
                    {listaOSAcabamentoEntregaRetirada.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {listaOSAcabamentoEntregaRetirada.length === 0 ? (
                    <Card className="p-3 text-xs text-muted-foreground">
                      Nenhuma OS.
                    </Card>
                  ) : null}
                  {listaOSAcabamentoEntregaRetirada.map(order =>
                    renderOrderCard(order, renderMoveButton(order))
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Instalação
                  </h3>
                  <Badge variant="outline">
                    {listaOSAcabamentoInstalacao.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {listaOSAcabamentoInstalacao.length === 0 ? (
                    <Card className="p-3 text-xs text-muted-foreground">
                      Nenhuma OS.
                    </Card>
                  ) : null}
                  {listaOSAcabamentoInstalacao.map(order =>
                    renderOrderCard(
                      order,
                      <>
                        {order.material_ready ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Material Pronto
                          </Badge>
                        ) : null}
                        {renderMoveButton(order)}
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex items-center">
              <h2 className="text-xl font-semibold">Embalagem</h2>
            </div>
            <div className="space-y-2">
              {listaOSEmbalagem.length === 0 ? (
                <Card className="p-3 text-xs text-muted-foreground">
                  Nenhuma OS.
                </Card>
              ) : null}
              {listaOSEmbalagem.map(order =>
                renderOrderCard(order, renderMoveButton(order))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={summaryModalCategory !== null}
        onOpenChange={open => !open && setSummaryModalCategory(null)}
      >
        <DialogContent className="h-[90vh] w-[98vw] max-w-[98vw] p-4 sm:p-6 xl:max-w-[1400px]">
          {summaryModalData ? (
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-semibold">
                  {summaryModalData.title} ({summaryFilteredOrders.length}/
                  {summaryModalData.orders.length})
                </h3>
                <Button
                  variant="outline"
                  onClick={() => setSummaryModalCategory(null)}
                >
                  Voltar
                </Button>
              </div>
              <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                <Card className="min-h-0 space-y-3 p-4">
                  <Input
                    value={summarySearch}
                    onChange={event => setSummarySearch(event.target.value)}
                    placeholder="Buscar OS"
                  />
                  <div className="min-h-0 space-y-2 overflow-y-auto">
                    {summaryFilteredOrders.map(order => {
                      const selectedClass =
                        summarySelectedKey === order.order_key
                          ? "border-primary bg-primary/5"
                          : "";

                      return (
                        <Card
                          key={order.order_key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSummarySelectedKey(order.order_key)}
                          className={`cursor-pointer space-y-2 p-3 ${selectedClass}`}
                        >
                          <p className="font-semibold">{getHeadline(order)}</p>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">
                              Produção • {order.upstream_status ?? "—"}
                            </Badge>
                            <Badge variant="outline">
                              {toTagLabel(order.delivery_mode)}
                            </Badge>
                            {order.material_ready ? (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                Material Pronto
                              </Badge>
                            ) : null}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Card>
                <Card className="min-h-0 overflow-y-auto p-4 sm:p-5">
                  {summarySelectedOrder ? (
                    <div className="space-y-4">
                      <h4 className="text-3xl font-semibold">
                        {getHeadline(summarySelectedOrder)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {KIOSK_STAGE_LABELS[summarySelectedOrder.current_stage]}
                      </p>
                      <p>
                        <strong>Cliente:</strong>{" "}
                        {summarySelectedOrder.client_name ?? "—"}
                      </p>
                      <p>
                        <strong>Descrição:</strong>{" "}
                        {summarySelectedOrder.description ?? "Sem descrição."}
                      </p>
                      <p>
                        <strong>Data de entrega:</strong>{" "}
                        {formatDatePtBr(summarySelectedOrder.delivery_date)}
                      </p>
                      <p>
                        <strong>Endereço:</strong>{" "}
                        {summarySelectedOrder.address ?? "—"}
                      </p>
                      <div>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void openLayout(summarySelectedLayout, setOpeningSummaryLayout)
                          }
                          disabled={
                            loadingSummaryLayout ||
                            openingSummaryLayout ||
                            !summarySelectedLayout
                          }
                        >
                          {openingSummaryLayout
                            ? "Abrindo layout..."
                            : loadingSummaryLayout
                              ? "Carregando layout..."
                              : "Abrir layout"}
                        </Button>
                      </div>
                      {renderInstallationFinalizeButton(summarySelectedOrder)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Selecione uma OS na lista para ver os detalhes.
                    </p>
                  )}
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={installationDialogOrder !== null}
        onOpenChange={open => !open && closeInstallationDialog()}
      >
        <DialogContent className="max-w-xl space-y-4">
          {installationDialogOrder ? (
            <>
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">Finalizar instalação</h3>
                <p className="text-sm text-muted-foreground">
                  Informe o feedback final da instalação para concluir a OS.
                </p>
              </div>
              <Card className="space-y-1 border-dashed p-3">
                <p className="text-sm font-semibold">{getHeadline(installationDialogOrder)}</p>
                <p className="text-xs text-muted-foreground">
                  Cliente: {installationDialogOrder.client_name ?? "—"}
                </p>
              </Card>
              <div className="space-y-2">
                <label className="text-sm font-medium">Feedback obrigatório</label>
                <Textarea
                  value={installationFeedback}
                  onChange={event => setInstallationFeedback(event.target.value)}
                  placeholder="Descreva como a instalação foi concluída..."
                  rows={5}
                  disabled={isCompletingInstallation}
                />
                <p className="text-xs text-muted-foreground">
                  Sem feedback não é possível finalizar a instalação.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={closeInstallationDialog}
                  disabled={isCompletingInstallation}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleCompleteInstallation()}
                  disabled={
                    isCompletingInstallation ||
                    processingId === installationDialogOrder.order_key ||
                    installationFeedback.trim().length === 0 ||
                    isMutationBlocked
                  }
                >
                  {isCompletingInstallation ? "Finalizando..." : "Finalizar instalação"}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-xl">
          {selectedOrder ? (
            <div className="space-y-3">
              <h3 className="text-xl font-semibold">
                {getHeadline(selectedOrder)}
              </h3>
              <p>
                <strong>Cliente:</strong> {selectedOrder.client_name ?? "—"}
              </p>
              <p>
                <strong>Descrição:</strong>{" "}
                {selectedOrder.description ?? "Sem descrição."}
              </p>
              <p>
                <strong>Data:</strong>{" "}
                {formatDatePtBr(selectedOrder.delivery_date)}
              </p>
              <p>
                <strong>Etapa:</strong>{" "}
                {KIOSK_STAGE_LABELS[selectedOrder.current_stage]}
              </p>
              <div>
                <Button
                  variant="outline"
                  onClick={() =>
                    void openLayout(selectedOrderLayout, setOpeningSelectedLayout)
                  }
                  disabled={
                    loadingSelectedLayout ||
                    openingSelectedLayout ||
                    !selectedOrderLayout
                  }
                >
                  {openingSelectedLayout
                    ? "Abrindo layout..."
                    : loadingSelectedLayout
                      ? "Carregando layout..."
                      : "Abrir layout"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="h-[60vh] w-[70vw] min-w-[600px] max-w-[1000px] p-8">
          <KioskOsLookupPanel
            loadingText="Buscando OS..."
            onFoundCode={handleAddByCode}
            onCancel={() => setAddModalOpen(false)}
            autoFocus
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
