import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { ART_COLUMNS, PROD_COLUMNS } from '@/features/hubos/constants';
import type { ArtStatus, AssetJob, HubOsFilters, OsOrder, ProdStatus } from '@/features/hubos/types';
import { archiveOrder, createOrderEvent, deleteOrder, fetchOrders, updateOrder } from '@/features/hubos/api';
import { getLatestAssetJobsByOsId } from '@/features/hubos/assetJobs';
import KanbanColumn from '@/features/hubos/components/KanbanColumn';
import KanbanCard from '@/features/hubos/components/KanbanCard';
import OrderDetailsDialog from '@/features/hubos/components/OrderDetailsDialog';
import CreateOSDialog from '@/features/hubos/components/CreateOSDialog';
import FiltersBar from '@/features/hubos/components/FiltersBar';
import InstallationsInbox from '@/features/hubos/components/InstallationsInbox';
import MetricsBar from '@/features/hubos/components/MetricsBar';
import { Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

const defaultFilters: HubOsFilters = {
  search: '',
  reproducao: false,
  letraCaixa: false,
  logisticType: 'all',
  overdueOnly: false,
};

const normalize = (value: string) => value.toLowerCase();

const FINAL_PROD_STATUS = PROD_COLUMNS[PROD_COLUMNS.length - 1];
const DONE_ASSET_STATUSES = new Set(['CLEANED', 'DONE', 'DONE_CLEANUP_FAILED']);

const isOverdue = (order: OsOrder) => {
  if (!order.delivery_date) return false;
  const [year, month, day] = order.delivery_date.split('-').map(Number);
  const delivery = new Date(year, (month ?? 1) - 1, day ?? 1);
  const today = new Date();
  delivery.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return delivery < today && order.prod_status !== FINAL_PROD_STATUS;
};

export default function HubOS() {
  const { user, isAdmin } = useAuth();
  const [orders, setOrders] = useState<OsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(defaultFilters);
  const [viewMode, setViewMode] = useState<'kanban' | 'instalacoes'>('kanban');
  const [activeTab, setActiveTab] = useState<'arte' | 'producao'>('arte');
  const [selectedOrder, setSelectedOrder] = useState<OsOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installationSearch, setInstallationSearch] = useState('');
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [assetJobByOsId, setAssetJobByOsId] = useState<Record<string, AssetJob | null>>({});

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchOrders();
      setOrders(data);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar o Hub OS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const channel = supabase
      .channel('hub-os-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'os_orders' }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const search = normalize(filters.search);
    return orders.filter((order) => {
      const matchesSearch =
        !search ||
        normalize(order.sale_number).includes(search) ||
        normalize(order.client_name).includes(search);
      const matchesRepro = !filters.reproducao || order.reproducao;
      const matchesLetra = !filters.letraCaixa || order.letra_caixa;
      const matchesLogistic =
        filters.logisticType === 'all' || order.logistic_type === filters.logisticType;
      const matchesOverdue = !filters.overdueOnly || isOverdue(order);
      return matchesSearch && matchesRepro && matchesLetra && matchesLogistic && matchesOverdue;
    });
  }, [orders, filters]);

  const arteOrders = useMemo(
    () => filteredOrders.filter((order) => !order.prod_status && ART_COLUMNS.includes(order.art_status)),
    [filteredOrders]
  );

  const producaoOrders = useMemo(
    () => filteredOrders.filter((order) => order.prod_status !== null),
    [filteredOrders]
  );

  const metrics = useMemo(() => {
    return {
      totalArte: arteOrders.length,
      totalProducao: producaoOrders.length,
      overdue: filteredOrders.filter(isOverdue).length,
      paraAprovacao: arteOrders.filter((order) => order.art_status === 'Para Aprovação').length,
      prontoAvisar: producaoOrders.filter((order) => order.prod_status === 'Pronto / Avisar Cliente').length,
      instalacoes: orders.filter(
        (order) => order.logistic_type === 'instalacao' && order.prod_status !== 'Finalizados'
      ).length,
    };
  }, [arteOrders, producaoOrders, filteredOrders, orders]);

  const installationOrders = useMemo(
    () => orders.filter((order) => order.logistic_type === 'instalacao'),
    [orders]
  );
  const installationInboxOrders = installationOrders;

  const visibleOrders = useMemo(() => {
    if (viewMode === 'instalacoes') return installationInboxOrders;
    return activeTab === 'arte' ? arteOrders : producaoOrders;
  }, [activeTab, arteOrders, installationInboxOrders, producaoOrders, viewMode]);

  const visibleOrderIds = useMemo(() => visibleOrders.map((order) => order.id), [visibleOrders]);

  const assetIndicatorByOsId = useMemo(() => {
    const indicators: Record<string, 'processing' | 'done' | null> = {};
    visibleOrderIds.forEach((osId) => {
      const job = assetJobByOsId[osId];
      if (!job) {
        indicators[osId] = null;
        return;
      }
      // "Concluído" when the latest job is finalized; otherwise keep "Processando".
      indicators[osId] = DONE_ASSET_STATUSES.has(job.status) ? 'done' : 'processing';
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
        console.error('Erro ao carregar jobs de arte.', error);
      }
    };

    const shouldReplaceJob = (current: AssetJob | null, incoming: AssetJob) => {
      if (!current) return true;
      const incomingCreated = new Date(incoming.created_at).getTime();
      const currentCreated = new Date(current.created_at).getTime();
      if (incomingCreated > currentCreated) return true;
      if (incomingCreated < currentCreated) return false;
      if (incoming.id === current.id) {
        const incomingUpdated = new Date(incoming.updated_at ?? incoming.created_at).getTime();
        const currentUpdated = new Date(current.updated_at ?? current.created_at).getTime();
        return incomingUpdated > currentUpdated;
      }
      return false;
    };

    loadLatestAssetJobs();

    const channel = supabase
      .channel('hub-os-asset-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'os_order_asset_jobs',
          filter: `os_id=in.(${visibleOrderIds.join(',')})`,
        },
        (payload) => {
          const incoming = payload.new as AssetJob;
          if (!incoming?.os_id) return;
          if (!visibleOrderIds.includes(incoming.os_id)) return;
          setAssetJobByOsId((prev) => {
            const current = prev[incoming.os_id] ?? null;
            if (!shouldReplaceJob(current, incoming)) return prev;
            return { ...prev, [incoming.os_id]: incoming };
          });
        }
      )
      .subscribe();

    const pollingInterval = window.setInterval(() => {
      loadLatestAssetJobs();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [visibleOrderIds]);

  useEffect(() => {
    if (viewMode !== 'instalacoes') return;
    if (installationInboxOrders.length === 0 && selectedInstallationId !== null) {
      setSelectedInstallationId(null);
    }
  }, [installationInboxOrders, selectedInstallationId, viewMode]);

  useEffect(() => {
    if (viewMode !== 'kanban' || !highlightId) return;
    const targetId = highlightId;
    const scrollTimer = window.setTimeout(() => {
      const element = document.querySelector(`[data-os-id="${targetId}"]`);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 200);
    const clearTimer = window.setTimeout(() => {
      setHighlightId(null);
    }, 2200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activeTab, highlightId, viewMode]);

  const updateLocalOrder = (updated: OsOrder) => {
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)));
  };

  const handleArchive = async (order: OsOrder) => {
    const previous = orders;
    setOrders((prev) => prev.filter((item) => item.id !== order.id));

    try {
      await archiveOrder(order.id, user?.id ?? null);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'archive',
          payload: { archived: true },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de arquivamento.', eventError);
      }
      toast.success('Card arquivado.');
    } catch (error) {
      console.error(error);
      setOrders(previous);
      toast.error('Não foi possível arquivar o card.');
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!isAdmin) {
      toast.error('Você não tem permissão para excluir.');
      return;
    }
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const previous = orders;
    setOrders((prev) => prev.filter((item) => item.id !== order.id));

    try {
      await deleteOrder(order.id);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'delete',
          payload: {
            previous: {
              id: order.id,
              sale_number: order.sale_number,
              client_name: order.client_name,
              title: order.title,
              art_status: order.art_status,
              prod_status: order.prod_status,
            },
            reason: 'manual_delete',
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de exclusão.', eventError);
      }
      toast.success('Card excluído.');
    } catch (error) {
      console.error(error);
      setOrders(previous);
      toast.error('Não foi possível excluir o card.');
    }
  };

  const handleDragEndArte = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const order = orders.find((item) => item.id === active.id);
    if (!order) return;
    const nextStatus = over.id as ArtStatus;
    if (order.art_status === nextStatus) return;

    const previous = order;
    const shouldInitProd = nextStatus === 'Produzir' && !order.prod_status;
    const optimistic = {
      ...order,
      art_status: nextStatus,
      prod_status: shouldInitProd ? 'Produção' : order.prod_status,
    } satisfies OsOrder;

    updateLocalOrder(optimistic);

    try {
      const updated = await updateOrder(order.id, {
        art_status: nextStatus,
        prod_status: shouldInitProd ? 'Produção' : order.prod_status,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'status_change',
          payload: {
            board: 'arte',
            from: order.art_status,
            to: nextStatus,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de status.', eventError);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao mover card.');
      updateLocalOrder(previous);
    }
  };

  const handleDragEndProducao = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const order = orders.find((item) => item.id === active.id);
    if (!order) return;
    const nextStatus = over.id as ProdStatus;
    if (order.prod_status === nextStatus) return;

    const previous = order;
    const optimistic = { ...order, prod_status: nextStatus } satisfies OsOrder;
    updateLocalOrder(optimistic);

    try {
      const updated = await updateOrder(order.id, {
        prod_status: nextStatus,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      updateLocalOrder(updated);
      try {
        await createOrderEvent({
          os_id: order.id,
          type: 'status_change',
          payload: {
            board: 'producao',
            from: order.prod_status,
            to: nextStatus,
          },
          created_by: user?.id ?? null,
        });
      } catch (eventError) {
        console.error('Erro ao registrar auditoria de status.', eventError);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao mover card.');
      updateLocalOrder(previous);
    }
  };

  const renderBoard = (ordersList: OsOrder[], columns: string[], onDragEnd: (event: DragEndEvent) => void) => {
    return (
      <DndContext onDragEnd={onDragEnd}>
        <div className="w-full overflow-x-auto">
          <div className="flex w-max gap-4 pb-4 pr-4">
            {columns.map((status) => {
              const items = ordersList.filter((order) =>
                columns === ART_COLUMNS ? order.art_status === status : order.prod_status === status
              );
              return (
                <KanbanColumn key={status} id={status} title={status} count={items.length}>
                  {items.map((order) => (
                    <KanbanCard
                      key={order.id}
                      id={order.id}
                      title={order.title || `${order.sale_number} - ${order.client_name}`}
                      clientName={order.client_name}
                      deliveryDate={order.delivery_date}
                      logisticType={order.logistic_type}
                      reproducao={order.reproducao}
                      letraCaixa={order.letra_caixa}
                      prodStatus={order.prod_status}
                      productionTag={order.production_tag}
                      assetIndicator={assetIndicatorByOsId[order.id] ?? null}
                      highlightId={highlightId}
                      showArchive={!isAdmin}
                      onOpen={() => {
                        setSelectedOrder(order);
                        setDialogOpen(true);
                      }}
                      onArchive={() => handleArchive(order)}
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hub OS Evolução - Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">
            Kanban integrado com tempo real e filtros avançados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Link href="/hub-os/auditoria">
              <Button variant="secondary">Auditoria</Button>
            </Link>
          )}
          <CreateOSDialog
            onCreated={(order) => {
              setOrders((prev) => [order, ...prev]);
            }}
          />
          <Button variant="outline" onClick={loadOrders} disabled={loading}>
            Atualizar
          </Button>
        </div>
      </div>

      <MetricsBar
        {...metrics}
        onInstalacoesClick={() => {
          setViewMode('instalacoes');
        }}
      />

      {viewMode === 'kanban' ? (
        <>
          <FiltersBar value={filters} onChange={setFilters} />
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'arte' | 'producao')} className="space-y-4">
            <TabsList>
              <TabsTrigger value="arte">Arte</TabsTrigger>
              <TabsTrigger value="producao">Produção</TabsTrigger>
            </TabsList>
            <TabsContent value="arte" className="space-y-4">
              {renderBoard(arteOrders, ART_COLUMNS, handleDragEndArte)}
            </TabsContent>
            <TabsContent value="producao" className="space-y-4">
              {renderBoard(producaoOrders, PROD_COLUMNS, handleDragEndProducao)}
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <InstallationsInbox
          orders={installationInboxOrders}
          selectedId={selectedInstallationId}
          searchValue={installationSearch}
          onSearchChange={setInstallationSearch}
          onSelect={setSelectedInstallationId}
          onBack={() => setViewMode('kanban')}
          onEdit={(order) => {
            setSelectedOrder(order);
            setDialogOpen(true);
          }}
          onOpenKanban={(order) => {
            setViewMode('kanban');
            setActiveTab(order.prod_status ? 'producao' : 'arte');
            setHighlightId(order.id);
          }}
        />
      )}

      <OrderDetailsDialog
        order={selectedOrder}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedOrder(null);
          }
        }}
        onUpdated={updateLocalOrder}
        onDelete={(id) => handleDelete(id)}
      />
    </div>
  );
}
