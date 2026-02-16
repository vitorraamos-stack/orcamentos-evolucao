import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { ART_COLUMNS, PROD_COLUMNS } from "@/features/hubos/constants";
import type {
  ArtDirectionTag,
  ArtStatus,
  AssetJob,
  HubOsFilters,
  OsOrder,
  ProdStatus,
} from "@/features/hubos/types";
import {
  archiveOrder,
  createOrderEvent,
  deleteOrder,
  fetchOrders,
  fetchUserDisplayNameById,
  updateOrder,
} from "@/features/hubos/api";
import { getLatestAssetJobsByOsId } from "@/features/hubos/assetJobs";
import KanbanColumn from "@/features/hubos/components/KanbanColumn";
import KanbanCard from "@/features/hubos/components/KanbanCard";
import ServiceOrderDialog from "@/features/hubos/components/ServiceOrderDialog";
import CreateOSDialog from "@/features/hubos/components/CreateOSDialog";
import ArtDirectionTagPopup from "@/features/hubos/components/ArtDirectionTagPopup";
import FiltersBar from "@/features/hubos/components/FiltersBar";
import InstallationsInbox from "@/features/hubos/components/InstallationsInbox";
import MetricsBar from "@/features/hubos/components/MetricsBar";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPendingSecondInstallments } from "@/features/hubos/finance";

const defaultFilters: HubOsFilters = {
  search: "",
  reproducao: false,
  letraCaixa: false,
  logisticType: "all",
  overdueOnly: false,
};

const normalize = (value: string) => value.toLowerCase();

const FINAL_PROD_STATUS = PROD_COLUMNS[PROD_COLUMNS.length - 1];
const DONE_ASSET_STATUSES = new Set(["CLEANED", "DONE", "DONE_CLEANUP_FAILED"]);
type InboxKey =
  | "global"
  | "arte"
  | "producao"
  | "aguardandoInsumos"
  | "producaoExterna"
  | "atrasados"
  | "prontoAvisar"
  | "instalacoes";

const isOverdue = (order: OsOrder) => {
  if (!order.delivery_date) return false;
  const [year, month, day] = order.delivery_date.split("-").map(Number);
  const delivery = new Date(year, (month ?? 1) - 1, day ?? 1);
  const today = new Date();
  delivery.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return delivery < today && order.prod_status !== FINAL_PROD_STATUS;
};

const playInsumosAlertSound = () => {
  if (typeof window === "undefined") return;
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const now = context.currentTime;
  const notes = [880, 660, 990];

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * 0.14;
    const endAt = startAt + 0.12;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt);
  });

  window.setTimeout(() => {
    void context.close();
  }, 700);
};

const getDisplayArtStatus = (status: ArtStatus): ArtStatus =>
  status === "Ajustes" ? "Para Aprovação" : status;

export default function HubOS() {
  const { user, isAdmin, hubPermissions, hasModuleAccess } = useAuth();
  const [, setLocation] = useLocation();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(defaultFilters);
  const [viewMode, setViewMode] = useState<"kanban" | "inbox">("kanban");
  const [inboxKey, setInboxKey] = useState<InboxKey>("instalacoes");
  const [activeTab, setActiveTab] = useState<"arte" | "producao">("arte");
  const [selectedOrder, setSelectedOrder] = useState<OsOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [artDirectionPopupOpen, setArtDirectionPopupOpen] = useState(false);
  const [artDirectionPopupTag, setArtDirectionPopupTag] =
    useState<ArtDirectionTag | null>(null);
  const [inboxSearch, setInboxSearch] = useState("");
  // Backward-compatible alias to prevent runtime crashes if stale/legacy code references kioskSearch.
  const kioskSearch = inboxSearch;
  const setKioskSearch = setInboxSearch;
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  // Backward-compatible alias to prevent runtime crashes if stale/legacy code references kioskOpenOrderId.
  const kioskOpenOrderId = selectedInboxId;
  const setKioskOpenOrderId = setSelectedInboxId;
  // Backward-compatible alias to prevent runtime crashes if stale/legacy code references hasOpenedKioskOrder.
  const hasOpenedInboxOrderRef = useRef(false);
  const hasOpenedKioskOrder = hasOpenedInboxOrderRef;
  const setHasOpenedKioskOrder = (value: boolean) => {
    hasOpenedInboxOrderRef.current = value;
  };
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [assetJobByOsId, setAssetJobByOsId] = useState<
    Record<string, AssetJob | null>
  >({});
  const [pendingInstallmentsCount, setPendingInstallmentsCount] = useState(0);
  const [insumosReturnNotesDraft, setInsumosReturnNotesDraft] = useState("");
  const [insumosRequestDetailsDraft, setInsumosRequestDetailsDraft] =
    useState("");
  const [updatingInsumosTransition, setUpdatingInsumosTransition] =
    useState(false);
  const [markingInsumosReadyOrderId, setMarkingInsumosReadyOrderId] = useState<string | null>(null);
  const [insumosRequesterName, setInsumosRequesterName] = useState<
    string | null
  >(null);
  const previousInsumosIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedInsumosRef = useRef(false);
  const hasAppliedKioskSearch = useRef(false);

  useEffect(() => {
    if (
      hubPermissions.canViewArteBoard &&
      !hubPermissions.canViewProducaoBoard
    ) {
      setActiveTab("arte");
    }
    if (
      !hubPermissions.canViewArteBoard &&
      hubPermissions.canViewProducaoBoard
    ) {
      setActiveTab("producao");
    }
  }, [hubPermissions.canViewArteBoard, hubPermissions.canViewProducaoBoard]);

  useEffect(() => {
    if (!kioskSearch || hasAppliedKioskSearch.current) return;
    setFilters(prev => ({ ...prev, search: kioskSearch }));
    setActiveTab("producao");
    hasAppliedKioskSearch.current = true;
  }, [kioskSearch]);

  const loadPendingInstallments = async () => {
    try {
      const pending = await fetchPendingSecondInstallments();
      setPendingInstallmentsCount(pending.length);
    } catch (error) {
      console.error("Erro ao carregar pendências financeiras", error);
    }
  };

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchOrders();
      setOrders(data);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar o Hub OS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const channel = supabase
      .channel("hub-os-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_orders" },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    loadPendingInstallments();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const search = normalize(filters.search);
    return orders.filter(order => {
      const matchesSearch =
        !search ||
        normalize(order.sale_number).includes(search) ||
        normalize(order.client_name).includes(search);
      const matchesRepro = !filters.reproducao || order.reproducao;
      const matchesLetra = !filters.letraCaixa || order.letra_caixa;
      const matchesLogistic =
        filters.logisticType === "all" ||
        order.logistic_type === filters.logisticType;
      const matchesOverdue = !filters.overdueOnly || isOverdue(order);
      return (
        matchesSearch &&
        matchesRepro &&
        matchesLetra &&
        matchesLogistic &&
        matchesOverdue
      );
    });
  }, [orders, filters]);

  const arteOrders = useMemo(
    () =>
      filteredOrders.filter(
        order =>
          !order.prod_status &&
          ART_COLUMNS.includes(getDisplayArtStatus(order.art_status))
      ),
    [filteredOrders]
  );

  const producaoOrders = useMemo(
    () => filteredOrders.filter(order => order.prod_status !== null),
    [filteredOrders]
  );

  const openOrders = useMemo(
    () => orders.filter(order => order.prod_status !== "Finalizados"),
    [orders]
  );

  const overdueOrders = useMemo(
    () => filteredOrders.filter(isOverdue),
    [filteredOrders]
  );

  const prontoAvisarOrders = useMemo(
    () =>
      producaoOrders.filter(
        order => order.prod_status === "Pronto / Avisar Cliente"
      ),
    [producaoOrders]
  );

  const instalacaoOrders = useMemo(
    () =>
      orders.filter(
        order =>
          order.logistic_type === "instalacao" &&
          order.prod_status !== "Finalizados"
      ),
    [orders]
  );

  const aguardandoInsumosOrders = useMemo(
    () =>
      producaoOrders.filter(
        order => order.production_tag === "AGUARDANDO_INSUMOS"
      ),
    [producaoOrders]
  );

  const producaoExternaOrders = useMemo(
    () =>
      producaoOrders.filter(
        order => order.production_tag === "PRODUCAO_EXTERNA"
      ),
    [producaoOrders]
  );

  const canViewAguardandoInsumos = hasModuleAccess("hub_os_insumos");
  const canViewProducaoExterna = hasModuleAccess("hub_os_producao_externa");

  useEffect(() => {
    if (inboxKey !== "aguardandoInsumos") {
      setInsumosRequesterName(null);
      return;
    }

    const selectedOrder = orders.find(
      order =>
        order.id === selectedInboxId &&
        order.production_tag === "AGUARDANDO_INSUMOS"
    );
    const requesterId =
      selectedOrder?.updated_by ?? selectedOrder?.created_by ?? null;

    if (!selectedOrder?.insumos_requested_at || !requesterId) {
      setInsumosRequesterName(null);
      return;
    }

    let active = true;
    fetchUserDisplayNameById(requesterId)
      .then(name => {
        if (active) {
          setInsumosRequesterName(name ?? requesterId);
        }
      })
      .catch(error => {
        console.error(
          "Erro ao carregar responsável pela solicitação de insumos.",
          error
        );
        if (active) {
          setInsumosRequesterName(requesterId);
        }
      });

    return () => {
      active = false;
    };
  }, [inboxKey, orders, selectedInboxId]);

  useEffect(() => {
    const selectedOrder = orders.find(order => order.id === selectedInboxId);
    if (!selectedOrder) {
      setInsumosReturnNotesDraft("");
      setInsumosRequestDetailsDraft("");
      return;
    }

    if (inboxKey === "aguardandoInsumos") {
      setInsumosReturnNotesDraft(selectedOrder.insumos_return_notes ?? "");
      return;
    }

    if (inboxKey === "producao" && selectedOrder.prod_status === "Produção") {
      setInsumosRequestDetailsDraft(selectedOrder.insumos_details ?? "");
      return;
    }
  }, [inboxKey, orders, selectedInboxId]);

  useEffect(() => {
    if (!canViewAguardandoInsumos) return;

    const currentIds = new Set(aguardandoInsumosOrders.map(order => order.id));
    const previousIds = previousInsumosIdsRef.current;
    let hasNewOrder = false;
    currentIds.forEach(id => {
      if (!previousIds.has(id)) hasNewOrder = true;
    });

    if (hasLoadedInsumosRef.current && hasNewOrder) {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("ATENÇÃO - Novo pedido de material!");
        } else if (Notification.permission === "default") {
          Notification.requestPermission().then(permission => {
            if (permission === "granted") {
              new Notification("ATENÇÃO - Novo pedido de material!");
            }
          });
        }
      }

      try {
        playInsumosAlertSound();
      } catch (error) {
        console.warn(
          "Não foi possível reproduzir o alerta sonoro de insumos.",
          error
        );
      }
    }

    previousInsumosIdsRef.current = currentIds;
    hasLoadedInsumosRef.current = true;
  }, [aguardandoInsumosOrders, canViewAguardandoInsumos]);

  const metrics = useMemo(() => {
    return {
      global: openOrders.length,
      totalArte: arteOrders.length,
      totalProducao: producaoOrders.length,
      overdue: overdueOrders.length,
      prontoAvisar: prontoAvisarOrders.length,
      instalacoes: instalacaoOrders.length,
      pendentes: pendingInstallmentsCount,
    };
  }, [
    arteOrders,
    instalacaoOrders.length,
    openOrders.length,
    overdueOrders.length,
    pendingInstallmentsCount,
    producaoOrders.length,
    prontoAvisarOrders.length,
  ]);

  const inboxOrders = useMemo(() => {
    if (inboxKey === "global") return openOrders;
    if (inboxKey === "arte") return arteOrders;
    if (inboxKey === "producao") return producaoOrders;
    if (inboxKey === "aguardandoInsumos") return aguardandoInsumosOrders;
    if (inboxKey === "producaoExterna") return producaoExternaOrders;
    if (inboxKey === "atrasados") return overdueOrders;
    if (inboxKey === "prontoAvisar") return prontoAvisarOrders;
    return instalacaoOrders;
  }, [
    arteOrders,
    aguardandoInsumosOrders,
    inboxKey,
    instalacaoOrders,
    openOrders,
    overdueOrders,
    producaoExternaOrders,
    producaoOrders,
    prontoAvisarOrders,
  ]);

  const visibleOrders = useMemo(() => {
    if (viewMode === "inbox") return inboxOrders;
    return activeTab === "arte" ? arteOrders : producaoOrders;
  }, [activeTab, arteOrders, inboxOrders, producaoOrders, viewMode]);

  const visibleOrderIds = useMemo(
    () => visibleOrders.map(order => order.id),
    [visibleOrders]
  );

  const assetIndicatorByOsId = useMemo(() => {
    const indicators: Record<string, "processing" | "done" | null> = {};
    visibleOrderIds.forEach(osId => {
      const job = assetJobByOsId[osId];
      if (!job) {
        indicators[osId] = null;
        return;
      }
      // "Concluído" when the latest job is finalized; otherwise keep "Processando".
      indicators[osId] = DONE_ASSET_STATUSES.has(job.status)
        ? "done"
        : "processing";
    });
    return indicators;
  }, [assetJobByOsId, visibleOrderIds]);

  useEffect(() => {
    if (visibleOrderIds.length === 0) {
      setAssetJobByOsId({});
      return;
    }

    let active = true;

    const loadLatestAssetJobs = async () => {
      try {
        const latestJobs = await getLatestAssetJobsByOsId(visibleOrderIds);
        if (active) {
          setAssetJobByOsId(latestJobs);
        }
      } catch (error) {
        console.error("Erro ao carregar jobs de arte.", error);
      }
    };

    const shouldReplaceJob = (current: AssetJob | null, incoming: AssetJob) => {
      if (!current) return true;

      const incomingCreated = new Date(incoming.created_at).getTime();
      const currentCreated = new Date(current.created_at).getTime();
      if (incomingCreated > currentCreated) return true;
      if (incomingCreated < currentCreated) return false;

      const incomingUpdated = new Date(
        incoming.updated_at ?? incoming.created_at
      ).getTime();
      const currentUpdated = new Date(
        current.updated_at ?? current.created_at
      ).getTime();

      if (incoming.id === current.id) {
        return incomingUpdated > currentUpdated;
      }

      return incomingUpdated >= currentUpdated;
    };

    loadLatestAssetJobs();

    const handleWindowFocus = () => {
      loadLatestAssetJobs();
    };

    window.addEventListener("focus", handleWindowFocus);

    const channel = supabase
      .channel("hub-os-asset-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_order_asset_jobs",
        },
        payload => {
          const incoming = payload.new as AssetJob;
          if (!incoming?.os_id) return;
          if (!visibleOrderIds.includes(incoming.os_id)) return;
          setAssetJobByOsId(prev => {
            const current = prev[incoming.os_id] ?? null;
            if (!shouldReplaceJob(current, incoming)) return prev;
            return { ...prev, [incoming.os_id]: incoming };
          });
        }
      )
      .subscribe();

    const pollingInterval = window.setInterval(() => {
      loadLatestAssetJobs();
    }, 5000);

    return () => {
      active = false;
      window.removeEventListener("focus", handleWindowFocus);
      window.clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [visibleOrderIds]);

  useEffect(() => {
    if (viewMode !== "inbox") return;
    if (inboxOrders.length === 0 && selectedInboxId !== null) {
      setSelectedInboxId(null);
    }
  }, [inboxOrders, selectedInboxId, viewMode]);

  useEffect(() => {
    if (viewMode !== "kanban" || !highlightId) return;
    const targetId = highlightId;
    const scrollTimer = window.setTimeout(() => {
      const element = document.querySelector(`[data-os-id="${targetId}"]`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 200);
    const clearTimer = window.setTimeout(() => {
      setHighlightId(null);
      setHasOpenedKioskOrder(false);
    }, 2200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activeTab, highlightId, viewMode]);

  const updateLocalOrder = (updated: OsOrder) => {
    setOrders(prev =>
      prev.map(order => (order.id === updated.id ? updated : order))
    );
  };

  const handleArchive = async (order: OsOrder) => {
    const previous = orders;
    setOrders(prev => prev.filter(item => item.id !== order.id));

    try {
      await archiveOrder(order.id, user?.id ?? null);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: "archive",
          payload: {
            archived: true,
            actor_name:
              user?.user_metadata?.full_name ?? user?.email ?? user?.id ?? null,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error(
          "Erro ao registrar auditoria de arquivamento.",
          eventError
        );
      }
      toast.success("Card arquivado.");
    } catch (error) {
      console.error(error);
      setOrders(previous);
      toast.error("Não foi possível arquivar o card.");
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!isAdmin) {
      toast.error("Você não tem permissão para excluir.");
      return;
    }
    const order = orders.find(item => item.id === orderId);
    if (!order) return;
    const previous = orders;
    setOrders(prev => prev.filter(item => item.id !== order.id));

    try {
      await deleteOrder(order.id);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: "delete",
          payload: {
            previous: {
              id: order.id,
              sale_number: order.sale_number,
              client_name: order.client_name,
              title: order.title,
              art_status: order.art_status,
              prod_status: order.prod_status,
            },
            reason: "manual_delete",
            actor_name:
              user?.user_metadata?.full_name ?? user?.email ?? user?.id ?? null,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error("Erro ao registrar auditoria de exclusão.", eventError);
      }
      toast.success("Card excluído.");
    } catch (error) {
      console.error(error);
      setOrders(previous);
      toast.error("Não foi possível excluir o card.");
    }
  };

  const handleDragEndArte = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    if (!hubPermissions.canMoveArteBoard) {
      toast.error("Você não tem permissão para mover cards de Arte.");
      return;
    }
    const order = orders.find(item => item.id === active.id);
    if (!order) return;
    const nextStatus = over.id as ArtStatus;
    if (getDisplayArtStatus(order.art_status) === nextStatus) return;

    const inboxStatus = ART_COLUMNS[0];
    const inCreationStatus = ART_COLUMNS[1];
    const previous = order;
    const shouldInitProd = nextStatus === "Produzir" && !order.prod_status;
    const optimistic = {
      ...order,
      art_status: nextStatus,
      prod_status: shouldInitProd ? "Produção" : order.prod_status,
    } satisfies OsOrder;

    updateLocalOrder(optimistic);

    try {
      const updated = await updateOrder(order.id, {
        art_status: nextStatus,
        prod_status: shouldInitProd ? "Produção" : order.prod_status,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      if (
        order.art_status === inboxStatus &&
        nextStatus === inCreationStatus &&
        updated.art_direction_tag
      ) {
        setArtDirectionPopupTag(updated.art_direction_tag);
        setArtDirectionPopupOpen(true);
      }
      try {
        await createOrderEvent({
          os_id: order.id,
          type: "status_change",
          payload: {
            board: "arte",
            from: order.art_status,
            to: nextStatus,
            actor_name:
              user?.user_metadata?.full_name ?? user?.email ?? user?.id ?? null,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error("Erro ao registrar auditoria de status.", eventError);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao mover card.");
      updateLocalOrder(previous);
    }
  };

  const handleDragEndProducao = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    if (!hubPermissions.canMoveProducaoBoard) {
      toast.error("Você não tem permissão para mover cards de Produção.");
      return;
    }
    const order = orders.find(item => item.id === active.id);
    if (!order) return;
    const nextStatus = over.id as ProdStatus;
    if (order.prod_status === nextStatus) return;

    const nextProductionTag =
      nextStatus === "Instalação Agendada"
        ? "PRONTO"
        : order.production_tag;

    const previous = order;
    const optimistic = {
      ...order,
      prod_status: nextStatus,
      production_tag: nextProductionTag,
    } satisfies OsOrder;
    updateLocalOrder(optimistic);

    try {
      const updated = await updateOrder(order.id, {
        prod_status: nextStatus,
        production_tag: nextProductionTag,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: "status_change",
          payload: {
            board: "producao",
            from: order.prod_status,
            to: nextStatus,
            actor_name:
              user?.user_metadata?.full_name ?? user?.email ?? user?.id ?? null,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error("Erro ao registrar auditoria de status.", eventError);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao mover card.");
      updateLocalOrder(previous);
    }
  };

  const handleReturnToProduction = async (order: OsOrder) => {
    if (insumosReturnNotesDraft.trim().length < 3) {
      toast.error("Informe observações com ao menos 3 caracteres.");
      return;
    }

    const resolvedAt = new Date().toISOString();
    const previous = order;
    const optimistic = {
      ...order,
      production_tag: "EM_PRODUCAO",
      insumos_return_notes: insumosReturnNotesDraft.trim(),
      insumos_resolved_at: resolvedAt,
      insumos_resolved_by: user?.id ?? null,
    } satisfies OsOrder;

    updateLocalOrder(optimistic);

    try {
      setUpdatingInsumosTransition(true);
      const updated = await updateOrder(order.id, {
        production_tag: "EM_PRODUCAO",
        insumos_return_notes: insumosReturnNotesDraft.trim(),
        insumos_resolved_at: resolvedAt,
        insumos_resolved_by: user?.id ?? null,
        updated_at: resolvedAt,
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      setInsumosReturnNotesDraft("");
      toast.success("OS retornada para Produção com observações.");
    } catch (error) {
      console.error("Erro ao retornar OS para produção.", error);
      updateLocalOrder(previous);
      toast.error("Não foi possível retornar a OS para produção.");
    } finally {
      setUpdatingInsumosTransition(false);
    }
  };

  const handleSendToInsumos = async (order: OsOrder) => {
    if (insumosRequestDetailsDraft.trim().length < 3) {
      toast.error("Informe os detalhes/observações do material necessário.");
      return;
    }

    const requestedAt = order.insumos_requested_at ?? new Date().toISOString();
    const previous = order;
    const optimistic = {
      ...order,
      production_tag: "AGUARDANDO_INSUMOS",
      insumos_details: insumosRequestDetailsDraft.trim(),
      insumos_requested_at: requestedAt,
      insumos_return_notes: null,
      insumos_resolved_at: null,
      insumos_resolved_by: null,
    } satisfies OsOrder;

    updateLocalOrder(optimistic);

    try {
      setUpdatingInsumosTransition(true);
      const updated = await updateOrder(order.id, {
        production_tag: "AGUARDANDO_INSUMOS",
        insumos_details: insumosRequestDetailsDraft.trim(),
        insumos_requested_at: requestedAt,
        insumos_return_notes: null,
        insumos_resolved_at: null,
        insumos_resolved_by: null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      toast.success("OS enviada para Aguardando Insumos.");
    } catch (error) {
      console.error("Erro ao enviar OS para aguardando insumos.", error);
      updateLocalOrder(previous);
      toast.error("Não foi possível enviar a OS para aguardando insumos.");
    } finally {
      setUpdatingInsumosTransition(false);
    }
  };

  const handleMarkAsInProduction = async (order: OsOrder) => {
    if (markingInsumosReadyOrderId) return;

    try {
      setMarkingInsumosReadyOrderId(order.id);
      const updated = await updateOrder(order.id, {
        production_tag: "EM_PRODUCAO",
        insumos_return_notes: null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });

      try {
        await createOrderEvent({
          os_id: order.id,
          type: "insumos_acknowledged",
          payload: {
            previous_production_tag: order.production_tag,
            next_production_tag: "EM_PRODUCAO",
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error("Erro ao registrar auditoria de confirmação de insumos.", eventError);
      }

      updateLocalOrder(updated);
      toast.success("Badge atualizada para Em Produção.");
    } catch (error) {
      console.error("Erro ao marcar OS como em produção.", error);
      toast.error("Não foi possível atualizar o status para Em Produção.");
    } finally {
      setMarkingInsumosReadyOrderId(null);
    }
  };

  const openInbox = (key: InboxKey) => {
    setDialogOpen(false);
    setSelectedOrder(null);
    setInboxKey(key);
    setViewMode("inbox");
    setSelectedInboxId(null);
    setInboxSearch("");
    setHighlightId(null);
    setHasOpenedKioskOrder(false);
  };

  const inboxMeta = useMemo(() => {
    if (inboxKey === "global") {
      return {
        title: "GLOBAL",
        emptyMessage: "Nenhuma OS em aberto no momento.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "arte") {
      return {
        title: "Total em Arte",
        emptyMessage: "Nenhuma OS encontrada em Arte.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "producao") {
      return {
        title: "Total em Produção",
        emptyMessage: "Nenhuma OS encontrada em Produção.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "aguardandoInsumos") {
      return {
        title: "Aguardando Insumos",
        emptyMessage: "Nenhuma OS aguardando insumos.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "producaoExterna") {
      return {
        title: "Produção Externa",
        emptyMessage: "Nenhuma OS em produção externa.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "atrasados") {
      return {
        title: "Atrasados",
        emptyMessage: "Nenhuma OS atrasada no momento.",
        showOptimizeRoute: false,
      };
    }
    if (inboxKey === "prontoAvisar") {
      return {
        title: "Pronto / Avisar",
        emptyMessage: "Nenhuma OS pronta para avisar.",
        showOptimizeRoute: false,
      };
    }
    return {
      title: "Instalações",
      emptyMessage: "Nenhuma OS marcada como Instalação.",
      showOptimizeRoute: true,
    };
  }, [inboxKey]);

  const renderBoard = (
    ordersList: OsOrder[],
    columns: string[],
    onDragEnd: (event: DragEndEvent) => void
  ) => {
    return (
      <DndContext onDragEnd={onDragEnd}>
        <div className="w-full overflow-x-auto">
          <div className="flex w-max gap-4 pb-4 pr-4">
            {columns.map(status => {
              const items = ordersList.filter(order =>
                columns === ART_COLUMNS
                  ? getDisplayArtStatus(order.art_status) === status
                  : order.prod_status === status
              );
              return (
                <KanbanColumn
                  key={status}
                  id={status}
                  title={status}
                  count={items.length}
                  headerAction={
                    columns === PROD_COLUMNS &&
                    status === "Em Acabamento" &&
                    hasModuleAccess("hub_os_kiosk") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation("/os/kiosk")}
                      >
                        Quiosque
                      </Button>
                    ) : null
                  }
                >
                  {items.map(order => (
                    <KanbanCard
                      key={order.id}
                      id={order.id}
                      title={
                        order.title ||
                        `${order.sale_number} - ${order.client_name}`
                      }
                      clientName={order.client_name}
                      deliveryDate={order.delivery_date}
                      logisticType={order.logistic_type}
                      reproducao={order.reproducao}
                      letraCaixa={order.letra_caixa}
                      prodStatus={order.prod_status}
                      productionTag={order.production_tag}
                      insumosReturnNotes={order.insumos_return_notes}
                      artDirectionTag={order.art_direction_tag}
                      assetIndicator={assetIndicatorByOsId[order.id] ?? null}
                      highlightId={highlightId}
                      showArchive={!isAdmin}
                      onOpen={() => {
                        setSelectedOrder(order);
                        setDialogOpen(true);
                      }}
                      onArchive={() => handleArchive(order)}
                      onMarkInsumosAsInProduction={() => handleMarkAsInProduction(order)}
                      markingInsumosAsInProduction={markingInsumosReadyOrderId === order.id}
                    />
                  ))}
                </KanbanColumn>
              );
            })}
          </div>
        </div>
      </DndContext>
    );
  };

  useEffect(() => {
    if (!kioskOpenOrderId || hasOpenedKioskOrder.current || orders.length === 0)
      return;
    const targetOrder = orders.find(order => order.id === kioskOpenOrderId);
    if (!targetOrder) return;
    setSelectedOrder(targetOrder);
    setDialogOpen(true);
    setActiveTab("producao");
    hasOpenedKioskOrder.current = true;
  }, [kioskOpenOrderId, orders]);

  if (!hubPermissions.canViewHubOS) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Hub OS</h1>
        <p className="text-sm text-muted-foreground">
          Sem permissão para acessar o módulo Hub OS.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Hub OS Evolução - Ordens de Serviço
          </h1>
          <p className="text-sm text-muted-foreground">
            Kanban integrado com tempo real e filtros avançados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hubPermissions.canViewAudit && (
            <Link href="/hub-os/auditoria">
              <Button variant="secondary">Auditoria</Button>
            </Link>
          )}
          {hubPermissions.canCreateOs && (
            <CreateOSDialog
              onCreated={order => {
                setOrders(prev => [order, ...prev]);
              }}
            />
          )}
          <Button variant="outline" onClick={loadOrders} disabled={loading}>
            Atualizar
          </Button>
        </div>
      </div>

      <MetricsBar
        {...metrics}
        aguardandoInsumos={
          canViewAguardandoInsumos ? aguardandoInsumosOrders.length : undefined
        }
        producaoExterna={
          canViewProducaoExterna ? producaoExternaOrders.length : undefined
        }
        insumosAlertActive={
          canViewAguardandoInsumos && aguardandoInsumosOrders.length > 0
        }
        onGlobalClick={() => openInbox("global")}
        onArteClick={() => openInbox("arte")}
        onProducaoClick={() => openInbox("producao")}
        onAguardandoInsumosClick={
          canViewAguardandoInsumos
            ? () => openInbox("aguardandoInsumos")
            : undefined
        }
        onProducaoExternaClick={
          canViewProducaoExterna
            ? () => openInbox("producaoExterna")
            : undefined
        }
        onAtrasadosClick={() => openInbox("atrasados")}
        onProntoAvisarClick={() => openInbox("prontoAvisar")}
        onInstalacoesClick={() => openInbox("instalacoes")}
        onPendentesClick={() => setLocation("/hub-os/pendentes")}
      />

      {viewMode === "kanban" ? (
        <>
          <FiltersBar value={filters} onChange={setFilters} />
          <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as "arte" | "producao")}
            className="space-y-4"
          >
            <TabsList>
              {hubPermissions.canViewArteBoard && (
                <TabsTrigger value="arte">Arte</TabsTrigger>
              )}
              {hubPermissions.canViewProducaoBoard && (
                <TabsTrigger value="producao">Produção</TabsTrigger>
              )}
            </TabsList>
            {!hubPermissions.canViewArteBoard &&
              !hubPermissions.canViewProducaoBoard && (
                <p className="text-sm text-muted-foreground">
                  Sem acesso aos boards do Hub OS.
                </p>
              )}
            {hubPermissions.canViewArteBoard && (
              <TabsContent value="arte" className="space-y-4">
                {renderBoard(arteOrders, ART_COLUMNS, handleDragEndArte)}
              </TabsContent>
            )}
            {hubPermissions.canViewProducaoBoard && (
              <TabsContent value="producao" className="space-y-4">
                {renderBoard(
                  producaoOrders,
                  PROD_COLUMNS,
                  handleDragEndProducao
                )}
              </TabsContent>
            )}
          </Tabs>
        </>
      ) : (
        <InstallationsInbox
          orders={inboxOrders}
          title={inboxMeta.title}
          emptyMessage={inboxMeta.emptyMessage}
          showOptimizeRoute={inboxMeta.showOptimizeRoute}
          selectedId={kioskOpenOrderId}
          searchValue={kioskSearch}
          onSearchChange={setKioskSearch}
          onSelect={id => {
            setHasOpenedKioskOrder(Boolean(id));
            setKioskOpenOrderId(id);
          }}
          onBack={() => setViewMode("kanban")}
          onEdit={order => {
            setSelectedOrder(order);
            setDialogOpen(true);
          }}
          onOpenKanban={order => {
            setViewMode("kanban");
            setActiveTab(order.prod_status ? "producao" : "arte");
            setHighlightId(order.id);
          }}
          renderOrderExtra={
            inboxKey === "aguardandoInsumos"
              ? order => (
                  <div className="space-y-1 rounded-md border border-red-200 bg-red-50 p-2 text-xs">
                    <p className="font-medium text-red-900">
                      Material necessário
                    </p>
                    <p className="whitespace-pre-line text-red-800">
                      {order.insumos_details || "(não informado)"}
                    </p>
                  </div>
                )
              : undefined
          }
          selectedOrderExtra={
            inboxKey === "aguardandoInsumos"
              ? order => (
                  <div className="grid gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                    <div>
                      <p className="text-xs uppercase text-red-800">
                        Detalhes do material necessário
                      </p>
                      <p className="whitespace-pre-line text-red-950">
                        {order.insumos_details || "(não informado)"}
                      </p>
                    </div>
                    {order.insumos_requested_at && (
                      <div>
                        <p className="text-xs uppercase text-red-800">
                          Solicitado em
                        </p>
                        <p className="text-red-900">
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(order.insumos_requested_at))}{" "}
                          {insumosRequesterName
                            ? `• ${insumosRequesterName}`
                            : ""}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="insumos-return-inline">
                        Observações para retorno à Produção
                      </Label>
                      <Textarea
                        id="insumos-return-inline"
                        value={insumosReturnNotesDraft}
                        onChange={event =>
                          setInsumosReturnNotesDraft(event.target.value)
                        }
                        placeholder="Descreva o que foi liberado e orientações para a produção..."
                        rows={3}
                      />
                    </div>
                  </div>
                )
              : inboxKey === "producao"
                ? order =>
                    order.prod_status === "Produção" ? (
                      <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="space-y-1">
                          <p className="text-xs uppercase text-amber-800">
                            Observações / Material necessário
                          </p>
                          <Textarea
                            value={insumosRequestDetailsDraft}
                            onChange={event =>
                              setInsumosRequestDetailsDraft(event.target.value)
                            }
                            placeholder="Ex: chapa ACM 3mm, fita VHB, tinta..."
                            rows={3}
                          />
                        </div>
                        {order.insumos_return_notes && (
                          <div>
                            <p className="text-xs uppercase text-amber-800">
                              Última observação de retorno
                            </p>
                            <p className="whitespace-pre-line text-amber-950">
                              {order.insumos_return_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : null
                : undefined
          }
          selectedOrderActions={
            inboxKey === "aguardandoInsumos"
              ? order => (
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleReturnToProduction(order)}
                    disabled={updatingInsumosTransition}
                  >
                    Retornar para Produção
                  </Button>
                )
              : inboxKey === "producao"
                ? order =>
                    order.prod_status === "Produção" ? (
                      <Button
                        variant="outline"
                        className="border-amber-500 text-amber-700 hover:bg-amber-100"
                        onClick={() => handleSendToInsumos(order)}
                        disabled={updatingInsumosTransition}
                      >
                        Enviar para Aguardando Insumos
                      </Button>
                    ) : null
                : undefined
          }
        />
      )}

      <ServiceOrderDialog
        order={selectedOrder}
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open);
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        onUpdated={updateLocalOrder}
        onDelete={id => handleDelete(id)}
      />
      {artDirectionPopupTag && (
        <ArtDirectionTagPopup
          open={artDirectionPopupOpen}
          onOpenChange={open => {
            setArtDirectionPopupOpen(open);
            if (!open) {
              setArtDirectionPopupTag(null);
            }
          }}
          tag={artDirectionPopupTag}
        />
      )}
    </div>
  );
}
