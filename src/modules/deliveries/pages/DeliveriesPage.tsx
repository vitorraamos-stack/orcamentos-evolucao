import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  Box,
  CheckCircle2,
  PackageCheck,
  Plus,
  RefreshCw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  setOrderFlowAvisado,
  markOrderFlowRetiradoAndFinalize,
} from "@/modules/hub-os/order-flow-api";
import { MutationInputDialog } from "@/shared/components/MutationInputDialog";
import { DeliveryScheduleDialog } from "../components/DeliveryScheduleDialog";
import { DeliveryEmptyState } from "../components/DeliveryEmptyState";
import {
  DeliverySummaryCards,
  type DeliverySummaryKey,
} from "../components/DeliverySummaryCards";
import { DeliveryToolbar } from "../components/DeliveryToolbar";
import {
  deliveryAction,
  loadDeliveryWorkspace,
  scheduleDelivery,
  updateDelivery,
} from "../repositories/deliveriesRepository";
import {
  DELIVERY_MODE_LABEL,
  DELIVERY_STATUS_LABEL,
  isLegacyDelivery,
  isWaitingDelivery,
  pickupState,
} from "../services/deliveries";
import {
  buildCompletedLogistics,
  filterActiveDeliveries,
  filterCompletedLogistics,
  filterPickups,
  filterWaitingOrders,
  formatDateTime,
  formatDeliveryDeadline,
  formatDeliveryScheduleStatus,
  isDeliveryOverdue,
  reconcileDeliverySelection,
  sortActiveDeliveries,
  sortPickups,
  sortWaitingOrders,
  summarizeDeliveryWorkspace,
  type DispatchQuickFilter,
  type HistoryPeriod,
  type HistoryType,
} from "../presentation/deliveriesPresentation";
import type { Delivery } from "../types";
import type { LogisticsOrder } from "@/modules/installations/types";

type DeliveryTab = "waiting" | "pickup" | "dispatch" | "done";
type Workspace = {
  deliveries: Delivery[];
  orders: LogisticsOrder[];
  flow: any[];
  profiles: any[];
};
const initialData: Workspace = {
  deliveries: [],
  orders: [],
  flow: [],
  profiles: [],
};
const deadlineTone = (date: string | null) => {
  const label = formatDeliveryDeadline(date);
  return label === "Prazo vencido"
    ? "destructive"
    : label === "Prazo hoje"
      ? "default"
      : "outline";
};

function InitialLoading() {
  return (
    <main className="w-full space-y-5 pb-12">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </main>
  );
}

export default function DeliveriesPage() {
  const { hubPermissions } = useAuth();
  const [data, setData] = useState<Workspace>(initialData);
  const [initialLoading, setInitialLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null),
    [activeTab, setActiveTab] = useState<DeliveryTab>("waiting");
  const [waitingQuery, setWaitingQuery] = useState(""),
    [pickupQuery, setPickupQuery] = useState(""),
    [dispatchQuery, setDispatchQuery] = useState(""),
    [historyQuery, setHistoryQuery] = useState("");
  const [dispatchQuickFilter, setDispatchQuickFilter] =
      useState<DispatchQuickFilter>("all"),
    [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week"),
    [historyType, setHistoryType] = useState<HistoryType>("all");
  const [selectedWaitingId, setSelectedWaitingId] = useState<string | null>(
      null
    ),
    [selectedPickupId, setSelectedPickupId] = useState<string | null>(null),
    [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false),
    [editing, setEditing] = useState<Delivery | null>(null),
    [dialogOrder, setDialogOrder] = useState<LogisticsOrder | null>(null);
  const [mutation, setMutation] = useState<{
      action: "cancel" | "complete";
      delivery: Delivery;
    } | null>(null),
    [deliveryBusyId, setDeliveryBusyId] = useState<string | null>(null),
    [pickupBusyId, setPickupBusyId] = useState<string | null>(null);
  const loadingRef = useRef(false),
    pickupBusyRef = useRef<string | null>(null),
    refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    hasDataRef = useRef(false);
  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      const workspace = await loadDeliveryWorkspace();
      setData(workspace);
      hasDataRef.current = true;
      setLastUpdatedAt(new Date());
      setLoadError(null);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar Entregas.";
      if (!hasDataRef.current) setLoadError(message);
      else toast.error(message);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void load(), 250);
    };
    const channel = supabase
      .channel("phase4-deliveries")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_deliveries" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hub_os_order_flow_state" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_orders" },
        refresh
      )
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const activeIds = useMemo(
    () =>
      new Set(
        data.deliveries
          .filter(item => ["SCHEDULED", "IN_TRANSIT"].includes(item.status))
          .map(item => item.os_id)
      ),
    [data.deliveries]
  );
  const waiting = data.orders.filter(order =>
      isWaitingDelivery(order, activeIds)
    ),
    legacy = data.orders.filter(order => isLegacyDelivery(order, activeIds));
  const pickups = data.orders.filter(
    order =>
      order.logistic_type === "retirada" &&
      ["Pronto / Avisar Cliente", "Finalizados"].includes(
        order.prod_status ?? ""
      )
  );
  const flowFor = useCallback(
    (order: LogisticsOrder) =>
      data.flow.find(
        flow => flow.source_type === "os_orders" && flow.source_id === order.id
      ),
    [data.flow]
  );
  const activePickups = pickups.filter(order => !flowFor(order)?.retirado_at),
    completedPickups = pickups.filter(order =>
      Boolean(flowFor(order)?.retirado_at)
    );
  const activeDeliveries = data.deliveries.filter(item =>
      ["SCHEDULED", "IN_TRANSIT"].includes(item.status)
    ),
    completedDeliveries = data.deliveries.filter(
      item => item.status === "COMPLETED"
    );
  const visibleWaiting = useMemo(
    () =>
      sortWaitingOrders(
        filterWaitingOrders([...waiting, ...legacy], waitingQuery)
      ),
    [waiting, legacy, waitingQuery]
  );
  const visiblePickups = useMemo(
    () => sortPickups(filterPickups(activePickups, pickupQuery), flowFor),
    [activePickups, pickupQuery, flowFor]
  );
  const visibleDeliveries = useMemo(
    () =>
      sortActiveDeliveries(
        filterActiveDeliveries(
          activeDeliveries,
          dispatchQuery,
          dispatchQuickFilter
        )
      ),
    [activeDeliveries, dispatchQuery, dispatchQuickFilter]
  );
  const history = useMemo(
    () =>
      buildCompletedLogistics(completedDeliveries, completedPickups, flowFor),
    [completedDeliveries, completedPickups, flowFor]
  );
  const visibleHistory = useMemo(
    () =>
      filterCompletedLogistics(
        history,
        historyQuery,
        historyType,
        historyPeriod
      ),
    [history, historyQuery, historyType, historyPeriod]
  );
  const summary = summarizeDeliveryWorkspace({
    waiting,
    legacy,
    activePickups,
    deliveries: data.deliveries,
    completedPickups,
    flowFor,
  });
  useEffect(
    () =>
      setSelectedWaitingId(current =>
        reconcileDeliverySelection(
          current,
          visibleWaiting.map(item => item.id)
        )
      ),
    [visibleWaiting]
  );
  useEffect(
    () =>
      setSelectedPickupId(current =>
        reconcileDeliverySelection(
          current,
          visiblePickups.map(item => item.id)
        )
      ),
    [visiblePickups]
  );
  useEffect(
    () =>
      setSelectedDeliveryId(current =>
        reconcileDeliverySelection(
          current,
          visibleDeliveries.map(item => item.id)
        )
      ),
    [visibleDeliveries]
  );
  const selectedWaiting = visibleWaiting.find(
      item => item.id === selectedWaitingId
    ),
    selectedPickup = visiblePickups.find(item => item.id === selectedPickupId),
    selectedDelivery = visibleDeliveries.find(
      item => item.id === selectedDeliveryId
    );
  const profileName = (id?: string | null) =>
    data.profiles.find(profile => profile.id === id)?.name || "Não definido";
  const selectSummary = (key: DeliverySummaryKey) => {
    if (key === "waiting") setActiveTab("waiting");
    if (key === "pickup") setActiveTab("pickup");
    if (key === "in_transit" || key === "overdue") {
      setActiveTab("dispatch");
      setDispatchQuickFilter(key);
    }
    if (key === "today") {
      setActiveTab("done");
      setHistoryPeriod("today");
    }
  };
  const activeSummary: DeliverySummaryKey | null =
    activeTab === "waiting"
      ? "waiting"
      : activeTab === "pickup"
        ? "pickup"
        : activeTab === "dispatch" && dispatchQuickFilter === "in_transit"
          ? "in_transit"
          : activeTab === "dispatch" && dispatchQuickFilter === "overdue"
            ? "overdue"
            : activeTab === "done" && historyPeriod === "today"
              ? "today"
              : null;
  const notify = async (order: LogisticsOrder, value = true) => {
    if (pickupBusyRef.current) return;
    pickupBusyRef.current = order.id;
    setPickupBusyId(order.id);
    try {
      await setOrderFlowAvisado(
        { sourceType: "os_orders", sourceId: order.id },
        value
      );
      toast.success(
        value ? "Cliente marcado como avisado." : "Aviso desmarcado."
      );
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar o aviso."
      );
    } finally {
      pickupBusyRef.current = null;
      setPickupBusyId(null);
    }
  };
  const pickup = async (order: LogisticsOrder) => {
    if (pickupBusyRef.current) return;
    pickupBusyRef.current = order.id;
    setPickupBusyId(order.id);
    try {
      await markOrderFlowRetiradoAndFinalize({
        identity: { sourceType: "os_orders", sourceId: order.id },
        actorName: null,
      });
      toast.success("Retirada concluída e OS finalizada.");
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a retirada."
      );
    } finally {
      pickupBusyRef.current = null;
      setPickupBusyId(null);
    }
  };
  const act = async (
    action: "start" | "complete" | "cancel",
    delivery: Delivery,
    extra = ""
  ) => {
    if (deliveryBusyId) return;
    setDeliveryBusyId(delivery.id);
    try {
      await deliveryAction(action, delivery.id, extra);
      toast.success("Entrega atualizada.");
      await load();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a entrega."
      );
      throw cause;
    } finally {
      setDeliveryBusyId(null);
    }
  };

  if (initialLoading) return <InitialLoading />;
  if (loadError && !hasDataRef.current)
    return (
      <main className="w-full space-y-5">
        <header>
          <h1 className="text-2xl font-bold">Entregas</h1>
          <p className="text-sm text-muted-foreground">
            Retiradas, frota própria e transportadoras.
          </p>
        </header>
        <DeliveryEmptyState
          icon={Box}
          title="Não foi possível carregar Entregas."
          description={loadError}
          action={<Button onClick={() => void load()}>Tentar novamente</Button>}
        />
      </main>
    );
  return (
    <main className="w-full min-w-0 space-y-4 pb-12">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Entregas</h1>
          <p className="text-sm text-muted-foreground">
            Retiradas, frota própria e transportadoras.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {lastUpdatedAt
              ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`
              : "Ainda não atualizado"}
          </span>
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
        </div>
      </header>
      <DeliverySummaryCards
        values={summary}
        active={activeSummary}
        onSelect={selectSummary}
      />
      <Tabs
        value={activeTab}
        onValueChange={value => setActiveTab(value as DeliveryTab)}
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="waiting">
            Aguardando cadastro{" "}
            <Badge variant="secondary" className="ml-2">
              {summary.waiting}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pickup">
            Retirada{" "}
            <Badge variant="secondary" className="ml-2">
              {summary.pickup}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="dispatch">
            Entrega / Transportadora{" "}
            <Badge variant="secondary" className="ml-2">
              {activeDeliveries.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="done">
            Concluídas{" "}
            <Badge variant="secondary" className="ml-2">
              {history.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="waiting" className="space-y-3">
          <DeliveryToolbar
            query={waitingQuery}
            onQueryChange={setWaitingQuery}
            placeholder="Buscar por OS, cliente ou endereço..."
          />
          {!visibleWaiting.length ? (
            <DeliveryEmptyState
              icon={Box}
              title="Nenhuma entrega aguardando cadastro"
              description="Todas as OS prontas para entrega já possuem dados logísticos cadastrados."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
              <QueueList>
                {visibleWaiting.map(order => {
                  const legacyItem = isLegacyDelivery(order, activeIds);
                  return (
                    <QueueButton
                      key={order.id}
                      selected={selectedWaitingId === order.id}
                      onClick={() => setSelectedWaitingId(order.id)}
                    >
                      <div className="flex justify-between gap-2">
                        <b>OS #{order.sale_number ?? "—"}</b>
                        <Badge variant="outline">
                          {legacyItem ? "Entrega legada" : "Entrega"}
                        </Badge>
                      </div>
                      <p className="font-medium">{order.client_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.address || "Sem endereço"}
                      </p>
                      <Badge
                        variant={deadlineTone(order.delivery_date)}
                        className="mt-2"
                      >
                        {formatDeliveryDeadline(order.delivery_date)}
                      </Badge>
                    </QueueButton>
                  );
                })}
              </QueueList>
              {selectedWaiting && (
                <Detail
                  title={`OS #${selectedWaiting.sale_number ?? "—"}`}
                  subtitle={selectedWaiting.client_name}
                  osId={selectedWaiting.id}
                >
                  <Facts
                    values={[
                      [
                        "Prazo",
                        formatDeliveryDeadline(selectedWaiting.delivery_date),
                      ],
                      ["Endereço", selectedWaiting.address || "Não informado"],
                      [
                        "Tipo logístico",
                        isLegacyDelivery(selectedWaiting, activeIds)
                          ? "Entrega legada sem detalhes"
                          : "Entrega",
                      ],
                      [
                        "Etapa atual",
                        selectedWaiting.prod_status || "Não informada",
                      ],
                    ]}
                  />
                  <ActionInfo
                    text={
                      isLegacyDelivery(selectedWaiting, activeIds)
                        ? "Complete os dados desta entrega legada para normalizar o acompanhamento."
                        : "Cadastre os dados da entrega para que ela entre no fluxo logístico."
                    }
                  />
                  {hubPermissions.canManageDeliveries && (
                    <Button
                      onClick={() => {
                        setDialogOrder(selectedWaiting);
                        setEditing(null);
                        setDialog(true);
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      {isLegacyDelivery(selectedWaiting, activeIds)
                        ? "Completar cadastro"
                        : "Agendar entrega"}
                    </Button>
                  )}
                </Detail>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="pickup" className="space-y-3">
          <DeliveryToolbar
            query={pickupQuery}
            onQueryChange={setPickupQuery}
            placeholder="Buscar por OS ou cliente..."
          />
          {!visiblePickups.length ? (
            <DeliveryEmptyState
              icon={PackageCheck}
              title="Nenhuma retirada pendente"
              description="Não há materiais aguardando retirada pelo cliente."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
              <QueueList>
                {visiblePickups.map(order => {
                  const flow = flowFor(order);
                  return (
                    <QueueButton
                      key={order.id}
                      selected={selectedPickupId === order.id}
                      onClick={() => setSelectedPickupId(order.id)}
                    >
                      <div className="flex justify-between gap-2">
                        <b>OS #{order.sale_number ?? "—"}</b>
                        <Badge>{pickupState(flow)}</Badge>
                      </div>
                      <p className="font-medium">{order.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDeliveryDeadline(order.delivery_date)}
                        {flow?.avisado_at
                          ? ` · Avisado em ${formatDateTime(flow.avisado_at)}`
                          : ""}
                      </p>
                    </QueueButton>
                  );
                })}
              </QueueList>
              {selectedPickup &&
                (() => {
                  const flow = flowFor(selectedPickup),
                    busy = pickupBusyId === selectedPickup.id;
                  return (
                    <Detail
                      title={`OS #${selectedPickup.sale_number ?? "—"}`}
                      subtitle={selectedPickup.client_name}
                      osId={selectedPickup.id}
                    >
                      <Facts
                        values={[
                          [
                            "Prazo",
                            formatDeliveryDeadline(
                              selectedPickup.delivery_date
                            ),
                          ],
                          [
                            "Endereço",
                            selectedPickup.address || "Não informado",
                          ],
                          ["Status de retirada", pickupState(flow)],
                          ...(flow?.avisado_at
                            ? [["Avisado em", formatDateTime(flow.avisado_at)]]
                            : []),
                        ]}
                      />
                      <ActionInfo
                        text={
                          flow?.avisado_at
                            ? "O cliente já foi avisado. Confirme a retirada quando o material for entregue."
                            : "Avise o cliente de que o material está disponível para retirada."
                        }
                      />
                      {hubPermissions.canManageDeliveries && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void notify(selectedPickup, !flow?.avisado_at)
                            }
                          >
                            <Bell className="mr-2 size-4" />
                            {flow?.avisado_at
                              ? "Desmarcar aviso"
                              : "Avisar cliente"}
                          </Button>
                          {flow?.avisado_at && (
                            <Button
                              disabled={busy}
                              onClick={() => void pickup(selectedPickup)}
                            >
                              <PackageCheck className="mr-2 size-4" />
                              {busy ? "Concluindo..." : "Marcar retirado"}
                            </Button>
                          )}
                        </div>
                      )}
                    </Detail>
                  );
                })()}
            </div>
          )}
        </TabsContent>
        <TabsContent value="dispatch" className="space-y-3">
          <DeliveryToolbar
            query={dispatchQuery}
            onQueryChange={setDispatchQuery}
            placeholder="Buscar por OS, cliente, transportadora ou rastreio..."
            activeFilterCount={dispatchQuickFilter === "all" ? 0 : 1}
            onClear={() => setDispatchQuickFilter("all")}
            filters={
              <QuickFilters
                value={dispatchQuickFilter}
                onChange={setDispatchQuickFilter}
              />
            }
          >
            <div className="flex gap-1 overflow-x-auto">
              {(
                [
                  ["all", "Todas"],
                  ["scheduled", "Agendadas"],
                  ["in_transit", "Em trânsito"],
                  ["overdue", "Atrasadas"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={dispatchQuickFilter === value ? "default" : "ghost"}
                  onClick={() => setDispatchQuickFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </DeliveryToolbar>
          {!visibleDeliveries.length ? (
            <DeliveryEmptyState
              icon={Truck}
              title={
                dispatchQuickFilter === "in_transit"
                  ? "Nenhuma entrega em trânsito."
                  : dispatchQuickFilter === "overdue"
                    ? "Nenhuma entrega atrasada."
                    : "Nenhuma entrega em andamento"
              }
              description={
                dispatchQuickFilter === "all"
                  ? "Não existem entregas próprias ou por transportadora em aberto."
                  : "Ajuste os filtros para consultar outras operações."
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
              <QueueList>
                {visibleDeliveries.map(delivery => (
                  <QueueButton
                    key={delivery.id}
                    selected={selectedDeliveryId === delivery.id}
                    onClick={() => setSelectedDeliveryId(delivery.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <b>OS #{delivery.order?.sale_number ?? "—"}</b>
                      <Badge
                        variant={
                          isDeliveryOverdue(delivery)
                            ? "destructive"
                            : "default"
                        }
                      >
                        {isDeliveryOverdue(delivery)
                          ? "ATRASADA"
                          : DELIVERY_STATUS_LABEL[delivery.status]}
                      </Badge>
                    </div>
                    <p className="font-medium">{delivery.order?.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DELIVERY_MODE_LABEL[delivery.mode]} ·{" "}
                      {formatDeliveryScheduleStatus(delivery)}
                    </p>
                    {delivery.mode === "OWN_DELIVERY" ? (
                      <p className="text-xs text-muted-foreground">
                        {profileName(delivery.assigned_to)}
                        {delivery.vehicle_label
                          ? ` · ${delivery.vehicle_label}`
                          : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {delivery.carrier_name ||
                          "Transportadora não informada"}
                        {delivery.tracking_code
                          ? ` · ${delivery.tracking_code}`
                          : ""}
                      </p>
                    )}
                  </QueueButton>
                ))}
              </QueueList>
              {selectedDelivery && (
                <Detail
                  title={`OS #${selectedDelivery.order?.sale_number ?? "—"}`}
                  subtitle={
                    selectedDelivery.order?.client_name ||
                    "Cliente não informado"
                  }
                  osId={selectedDelivery.os_id}
                  badges={
                    <>
                      <Badge>
                        {DELIVERY_STATUS_LABEL[selectedDelivery.status]}
                      </Badge>
                      <Badge variant="outline">
                        {DELIVERY_MODE_LABEL[selectedDelivery.mode]}
                      </Badge>
                      {isDeliveryOverdue(selectedDelivery) && (
                        <Badge variant="destructive">ATRASADA</Badge>
                      )}
                    </>
                  }
                >
                  <Facts
                    values={[
                      [
                        "Agendado para",
                        formatDeliveryScheduleStatus(selectedDelivery),
                      ],
                      [
                        "Prazo da OS",
                        formatDeliveryDeadline(
                          selectedDelivery.order?.delivery_date
                        ),
                      ],
                      ["Modo", DELIVERY_MODE_LABEL[selectedDelivery.mode]],
                      [
                        "Endereço",
                        selectedDelivery.order?.address || "Não informado",
                      ],
                      ...(selectedDelivery.mode === "OWN_DELIVERY"
                        ? [
                            [
                              "Responsável",
                              profileName(selectedDelivery.assigned_to),
                            ],
                            [
                              "Veículo",
                              selectedDelivery.vehicle_label || "Não definido",
                            ],
                          ]
                        : [
                            [
                              "Transportadora",
                              selectedDelivery.carrier_name || "Não informada",
                            ],
                            [
                              "Código de rastreio",
                              selectedDelivery.tracking_code || "Não informado",
                            ],
                          ]),
                    ]}
                  />
                  {selectedDelivery.notes && (
                    <section>
                      <h3 className="text-sm font-semibold">Observações</h3>
                      <p className="mt-1 rounded-lg bg-muted p-3 text-sm">
                        {selectedDelivery.notes}
                      </p>
                    </section>
                  )}
                  {hubPermissions.canManageDeliveries && (
                    <div className="flex flex-wrap gap-2">
                      {selectedDelivery.status === "SCHEDULED" && (
                        <Button
                          disabled={deliveryBusyId === selectedDelivery.id}
                          onClick={() => void act("start", selectedDelivery)}
                        >
                          <Truck className="mr-2 size-4" />
                          Despachar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={Boolean(deliveryBusyId)}
                        onClick={() => {
                          setEditing(selectedDelivery);
                          setDialogOrder(null);
                          setDialog(true);
                        }}
                      >
                        Editar detalhes
                      </Button>
                      <Button
                        disabled={Boolean(deliveryBusyId)}
                        onClick={() =>
                          setMutation({
                            action: "complete",
                            delivery: selectedDelivery,
                          })
                        }
                      >
                        Concluir
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={Boolean(deliveryBusyId)}
                        onClick={() =>
                          setMutation({
                            action: "cancel",
                            delivery: selectedDelivery,
                          })
                        }
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </Detail>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="done" className="space-y-3">
          <DeliveryToolbar
            query={historyQuery}
            onQueryChange={setHistoryQuery}
            placeholder="Buscar por OS ou cliente..."
            activeFilterCount={
              (historyType === "all" ? 0 : 1) +
              (historyPeriod === "week" ? 0 : 1)
            }
            onClear={() => {
              setHistoryType("all");
              setHistoryPeriod("week");
            }}
            filters={
              <div className="grid gap-3">
                <FilterSelect
                  label="Tipo"
                  value={historyType}
                  onChange={value => setHistoryType(value as HistoryType)}
                  options={[
                    ["all", "Todos"],
                    ["pickup", "Retirada"],
                    ["OWN_DELIVERY", "Entrega própria"],
                    ["CARRIER", "Transportadora"],
                  ]}
                />
                <FilterSelect
                  label="Período"
                  value={historyPeriod}
                  onChange={value => setHistoryPeriod(value as HistoryPeriod)}
                  options={[
                    ["today", "Hoje"],
                    ["week", "Esta semana"],
                    ["month", "Este mês"],
                    ["all", "Todo período"],
                  ]}
                />
              </div>
            }
          />
          {!visibleHistory.length ? (
            <DeliveryEmptyState
              icon={CheckCircle2}
              title={
                history.length
                  ? "Nenhum resultado para os filtros selecionados."
                  : "Nenhuma entrega concluída."
              }
              description={
                history.length
                  ? "Limpe ou ajuste os filtros para ver outras operações."
                  : "As retiradas e entregas concluídas aparecerão aqui."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="hidden grid-cols-[150px_120px_1fr_190px_1fr] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground md:grid">
                <span>Tipo</span>
                <span>OS</span>
                <span>Cliente</span>
                <span>Concluída em</span>
                <span>Responsável</span>
              </div>
              {visibleHistory.map(entry => {
                const delivery =
                    entry.kind === "delivery" ? entry.delivery : null,
                  order =
                    delivery?.order ??
                    (entry.kind === "pickup" ? entry.order : null);
                return (
                  <div
                    key={`${entry.kind}-${entry.id}`}
                    className="grid gap-1 border-b px-4 py-3 text-sm last:border-0 md:grid-cols-[150px_120px_1fr_190px_1fr] md:gap-3"
                  >
                    <Badge variant="outline" className="w-fit">
                      {entry.kind === "pickup"
                        ? "Retirada"
                        : DELIVERY_MODE_LABEL[delivery!.mode]}
                    </Badge>
                    <Link
                      href={`/os/${order?.id ?? delivery?.os_id}`}
                      className="font-semibold text-primary"
                    >
                      OS #{order?.sale_number ?? "—"}
                    </Link>
                    <span>{order?.client_name}</span>
                    <span>{formatDateTime(entry.occurredAt)}</span>
                    <span className="text-muted-foreground">
                      {delivery
                        ? (delivery.mode === "CARRIER"
                            ? delivery.carrier_name
                            : profileName(delivery.assigned_to)) || "—"
                        : "—"}
                      {delivery?.recipient_name
                        ? ` · Recebedor: ${delivery.recipient_name}`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <DeliveryScheduleDialog
        order={dialogOrder}
        delivery={editing}
        profiles={data.profiles}
        open={dialog}
        onOpenChange={setDialog}
        onSave={async input => {
          try {
            if (editing) await updateDelivery(editing.id, input);
            else await scheduleDelivery(input);
            toast.success(
              editing ? "Entrega atualizada." : "Entrega agendada."
            );
            await load();
          } catch (cause) {
            toast.error(
              cause instanceof Error
                ? cause.message
                : "Não foi possível salvar a entrega."
            );
            throw cause;
          }
        }}
      />
      <MutationInputDialog
        open={Boolean(mutation)}
        onOpenChange={open => {
          if (!open) setMutation(null);
        }}
        title={
          mutation?.action === "cancel"
            ? "Cancelar entrega"
            : "Concluir entrega"
        }
        label={
          mutation?.action === "cancel"
            ? "Motivo"
            : "Nome do recebedor (opcional)"
        }
        required={mutation?.action === "cancel"}
        confirmLabel={
          mutation?.action === "cancel"
            ? "Confirmar cancelamento"
            : "Concluir entrega"
        }
        onConfirm={async value => {
          if (mutation) await act(mutation.action, mutation.delivery, value);
        }}
      />
    </main>
  );
}

function QueueList({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[590px] space-y-2 overflow-y-auto pr-1">
      {children}
    </div>
  );
}
function QueueButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`w-full rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary ring-1 ring-primary/20" : ""}`}
    >
      {children}
    </button>
  );
}
function Detail({
  title,
  subtitle,
  osId,
  badges,
  children,
}: {
  title: string;
  subtitle: string;
  osId: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-fit lg:sticky lg:top-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-2 flex gap-2">{badges}</div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/os/${osId}`}>Abrir OS</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
function Facts({ values }: { values: string[][] }) {
  return (
    <dl className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function ActionInfo({ text }: { text: string }) {
  return (
    <section className="rounded-xl bg-primary/5 p-4">
      <h3 className="text-sm font-semibold">O que precisa ser feito</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </section>
  );
}
function QuickFilters({
  value,
  onChange,
}: {
  value: DispatchQuickFilter;
  onChange: (value: DispatchQuickFilter) => void;
}) {
  return (
    <FilterSelect
      label="Situação"
      value={value}
      onChange={next => onChange(next as DispatchQuickFilter)}
      options={[
        ["all", "Todas"],
        ["scheduled", "Agendadas"],
        ["in_transit", "Em trânsito"],
        ["overdue", "Atrasadas"],
      ]}
    />
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-md border bg-background px-3 font-normal"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
