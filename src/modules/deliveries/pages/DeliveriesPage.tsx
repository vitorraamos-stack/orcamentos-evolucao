import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Bell, PackageCheck, Plus, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  setOrderFlowAvisado,
  markOrderFlowRetiradoAndFinalize,
} from "@/modules/hub-os/order-flow-api";
import { DeliveryScheduleDialog } from "../components/DeliveryScheduleDialog";
import {
  deliveryAction,
  loadDeliveryWorkspace,
  scheduleDelivery,
  updateDelivery,
} from "../repositories/deliveriesRepository";
import { MutationInputDialog } from "@/shared/components/MutationInputDialog";
import {
  DELIVERY_MODE_LABEL,
  DELIVERY_STATUS_LABEL,
  isLegacyDelivery,
  isWaitingDelivery,
  pickupState,
} from "../services/deliveries";
import type { Delivery } from "../types";
import type { LogisticsOrder } from "@/modules/installations/types";
const Empty = ({ children }: { children: string }) => (
  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
    {children}
  </p>
);
export default function DeliveriesPage() {
  const { hubPermissions } = useAuth();
  const [data, setData] = useState<{
    deliveries: Delivery[];
    orders: LogisticsOrder[];
    flow: any[];
    profiles: any[];
  }>({ deliveries: [], orders: [], flow: [], profiles: [] });
  const [selected, setSelected] = useState<LogisticsOrder | null>(null);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Delivery | null>(null);
  const [mutation, setMutation] = useState<{ action: "cancel" | "complete"; delivery: Delivery } | null>(null);
  const [pickupBusyId, setPickupBusyId] = useState<string | null>(null);
  const pickupBusyRef = useRef<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await loadDeliveryWorkspace());
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(() => void load(), 250); };
    const c = supabase
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
      .on("postgres_changes", { event: "*", schema: "public", table: "os_orders" }, refresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current); void supabase.removeChannel(c);
    };
  }, [load]);
  const active = new Set(
    data.deliveries
      .filter(d => ["SCHEDULED", "IN_TRANSIT"].includes(d.status))
      .map(d => d.os_id)
  );
  const waiting = data.orders.filter(o => isWaitingDelivery(o, active));
  const legacy = data.orders.filter(o => isLegacyDelivery(o, active));
  const pickups = data.orders.filter(
    o =>
      o.logistic_type === "retirada" &&
      ["Pronto / Avisar Cliente", "Finalizados"].includes(o.prod_status ?? "")
  );
  const flowFor = (o: LogisticsOrder) =>
    data.flow.find(f => f.source_type === "os_orders" && f.source_id === o.id);
  const activePickups = pickups.filter(o => !flowFor(o)?.retirado_at);
  const completedPickups = pickups.filter(o => Boolean(flowFor(o)?.retirado_at));
  const activeDeliveries = data.deliveries.filter(d =>
    ["SCHEDULED", "IN_TRANSIT"].includes(d.status)
  );
  const completedDeliveries = data.deliveries.filter(d => d.status === "COMPLETED");
  const notify = async (o: LogisticsOrder, value = true) => {
    await setOrderFlowAvisado(
      { sourceType: "os_orders", sourceId: o.id },
      value
    );
    toast.success(
      value ? "Cliente marcado como avisado." : "Aviso desmarcado."
    );
    await load();
  };
  const pickup = async (o: LogisticsOrder) => {
    if (pickupBusyRef.current) return;
    pickupBusyRef.current = o.id;
    setPickupBusyId(o.id);
    try {
      await markOrderFlowRetiradoAndFinalize({
        identity: { sourceType: "os_orders", sourceId: o.id },
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
  const act = async (a: "start" | "complete" | "cancel", d: Delivery, extra = "") => {
    await deliveryAction(a, d.id, extra);
    toast.success("Entrega atualizada.");
    await load();
  };
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entregas</h1>
          <p className="text-sm text-muted-foreground">
            Retiradas, frota própria e transportadoras.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="mr-2 size-4" />
          Atualizar
        </Button>
      </div>
      <Tabs defaultValue="waiting">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="waiting">
            Aguardando{" "}
            <Badge className="ml-2">{waiting.length + legacy.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pickup">
            Retirada <Badge className="ml-2">{activePickups.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="dispatch">
            Entrega / Transportadora
            <Badge className="ml-2">{activeDeliveries.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="done">
            Concluídas
            <Badge className="ml-2">{completedDeliveries.length + completedPickups.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="waiting">
          <div className="grid gap-3">
            {[...waiting, ...legacy].map(o => (
              <Card key={o.id}>
                <CardContent className="flex flex-col justify-between gap-3 pt-5 sm:flex-row sm:items-center">
                  <div>
                    <Link
                      href={`/os/${o.id}`}
                      className="font-semibold text-primary"
                    >
                      OS {o.sale_number ?? "—"} · {o.client_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {o.address || "Sem endereço"}
                    </p>
                    {o.prod_status?.startsWith("Logística") && (
                      <Badge variant="outline">
                        Entrega legada sem detalhes
                      </Badge>
                    )}
                  </div>
                  {hubPermissions.canManageDeliveries && (
                    <Button
                      onClick={() => {
                        setSelected(o);
                        setEditing(null);
                        setDialog(true);
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      Agendar entrega
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {!waiting.length && !legacy.length && (
              <Empty>Nenhuma entrega aguardando cadastro.</Empty>
            )}
          </div>
        </TabsContent>
        <TabsContent value="pickup">
          <div className="grid gap-3">
            {activePickups.map(o => {
              const flow = flowFor(o);
              return (
                <Card key={o.id}>
                  <CardContent className="flex flex-col justify-between gap-3 pt-5 sm:flex-row sm:items-center">
                    <div>
                      <Link
                        href={`/os/${o.id}`}
                        className="font-semibold text-primary"
                      >
                        OS {o.sale_number ?? "—"} · {o.client_name}
                      </Link>
                      <p>
                        <Badge>{pickupState(flow)}</Badge>
                        {flow?.avisado_at &&
                          ` · Avisado em ${new Date(flow.avisado_at).toLocaleString("pt-BR")}`}
                      </p>
                    </div>
                    {hubPermissions.canManageDeliveries && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => notify(o, !flow?.avisado_at)}
                        >
                          <Bell className="mr-2 size-4" />
                          {flow?.avisado_at
                            ? "Desmarcar aviso"
                            : "Avisar cliente"}
                        </Button>
                        <Button
                          disabled={pickupBusyId === o.id}
                          onClick={() => pickup(o)}
                        >
                          <PackageCheck className="mr-2 size-4" />
                          {pickupBusyId === o.id ? "Concluindo..." : "Marcar retirado"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {!activePickups.length && (
              <Empty>Nenhuma retirada aguardando conclusão.</Empty>
            )}
          </div>
        </TabsContent>
        <TabsContent value="dispatch">
          <div className="grid gap-3">
            {activeDeliveries.map(d => (
                <Card key={d.id}>
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex justify-between">
                      <Link
                        href={`/os/${d.os_id}`}
                        className="font-semibold text-primary"
                      >
                        OS {d.order?.sale_number ?? "—"} ·{" "}
                        {d.order?.client_name}
                      </Link>
                      <Badge>{DELIVERY_STATUS_LABEL[d.status]}</Badge>
                    </div>
                    <p>
                      {DELIVERY_MODE_LABEL[d.mode]} ·{" "}
                      {d.scheduled_at
                        ? new Date(d.scheduled_at).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                          })
                        : "Sem horário"}
                    </p>
                    {d.mode === "CARRIER" && (
                      <p className="text-sm">
                        {d.carrier_name || "Transportadora não informada"} ·
                        Rastreio: {d.tracking_code || "—"}
                      </p>
                    )}
                    {d.mode === "OWN_DELIVERY" && <p className="text-sm">Responsável: {data.profiles.find(p => p.id === d.assigned_to)?.name || "Não definido"} · Veículo: {d.vehicle_label || "Não definido"}</p>}
                    {hubPermissions.canManageDeliveries && (
                      <div className="flex flex-wrap gap-2">
                        {d.status === "SCHEDULED" && (
                          <Button onClick={() => act("start", d)}>
                            <Truck className="mr-2 size-4" />
                            Despachar
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => { setEditing(d); setSelected(null); setDialog(true); }}>Editar detalhes</Button>
                        <Button onClick={() => setMutation({ action: "complete", delivery: d })}>
                          Concluir
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => setMutation({ action: "cancel", delivery: d })}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}{" "}
          </div>
        </TabsContent>
        <TabsContent value="done">
          <div className="grid gap-3">
            {completedDeliveries.map(d => (
                <Card key={d.id}>
                  <CardContent className="pt-5">
                    <b>Entrega · OS {d.order?.sale_number ?? "—"}</b>
                    <p>
                      {d.order?.client_name} ·{" "}
                      {d.completed_at &&
                        new Date(d.completed_at).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            {completedPickups.map(o => (
                <Card key={o.id}>
                  <CardContent className="pt-5">
                    <b>Retirada · OS {o.sale_number ?? "—"}</b>
                    <p>
                      {o.client_name} ·{" "}
                      {new Date(flowFor(o).retirado_at).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>
      <DeliveryScheduleDialog
        order={selected}
        delivery={editing}
        profiles={data.profiles}
        open={dialog}
        onOpenChange={setDialog}
        onSave={async i => {
          if (editing) await updateDelivery(editing.id, i); else await scheduleDelivery(i);
          toast.success("Entrega agendada.");
          await load();
        }}
      />
      <MutationInputDialog open={Boolean(mutation)} onOpenChange={v => { if (!v) setMutation(null); }} title={mutation?.action === "cancel" ? "Cancelar entrega" : "Concluir entrega"} label={mutation?.action === "cancel" ? "Motivo" : "Nome do recebedor (opcional)"} required={mutation?.action === "cancel"} confirmLabel={mutation?.action === "cancel" ? "Confirmar cancelamento" : "Concluir entrega"} onConfirm={async value => { if (mutation) await act(mutation.action, mutation.delivery, value); }} />
    </main>
  );
}
