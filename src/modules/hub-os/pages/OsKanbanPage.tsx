import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchOsList, fetchOsStatuses, updateOs, createOsEvent } from "../api";
import type { Os, OsStatus } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import {
  isDeliveryRetirada,
  useGlobalOrderFlowState,
} from "../order-flow-state";
import { buildHubOrderFlowKeyFromOsId } from "../order-flow-key";
import { filterHubReadyToNotifyOrders } from "../order-flow-selectors";

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

export default function OsKanbanPage() {
  const { user } = useAuth();
  const { isAvisado, isRetirado, setAvisado, markRetirado } =
    useGlobalOrderFlowState();
  const [statuses, setStatuses] = useState<OsStatus[]>([]);
  const [orders, setOrders] = useState<Os[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFlowKeys, setPendingFlowKeys] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusData, osData] = await Promise.all([
        fetchOsStatuses(),
        fetchOsList(),
      ]);
      setStatuses(statusData);
      setOrders(osData);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar o Hub OS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const ordersByStatus = useMemo(() => {
    const map = new Map<string, Os[]>();
    statuses.forEach(status => map.set(status.id, []));
    orders.forEach(order => {
      if (!map.has(order.status_id)) {
        map.set(order.status_id, []);
      }
      map.get(order.status_id)?.push(order);
    });
    return map;
  }, [orders, statuses]);

  const handleMove = async (order: Os, nextStatusId: string) => {
    try {
      const updated = await updateOs(order.id, {
        status_id: nextStatusId,
        updated_at: new Date().toISOString(),
      });
      await createOsEvent({
        os_id: order.id,
        type: "STATUS_CHANGED",
        payload: { from: order.status_id, to: nextStatusId },
        created_by: user?.id ?? null,
      });
      setOrders(prev =>
        prev.map(item => (item.id === order.id ? updated : item))
      );
      toast.success("Status atualizado.");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao mover a OS.");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Carregando Hub OS...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hub OS</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe e mova ordens de serviço pelos status configurados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/os/novo">
            <Button>Nova OS</Button>
          </Link>
          <Button variant="outline" onClick={loadData}>
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {statuses.map(status => {
          const items = ordersByStatus.get(status.id) ?? [];
          const isProntoAvisarColumn =
            status.name.trim().toLowerCase() === "pronto/avisar";
          const visibleItems = isProntoAvisarColumn
            ? filterHubReadyToNotifyOrders(items, isRetirado)
            : items;

          return (
            <div key={status.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {status.name}
                </h2>
                <Badge variant="secondary">{visibleItems.length}</Badge>
              </div>
              <div className="space-y-3">
                {visibleItems.length === 0 && (
                  <Card className="p-4 text-xs text-muted-foreground">
                    Nenhuma OS neste status.
                  </Card>
                )}
                {visibleItems.map(order => {
                  const avisado = isProntoAvisarColumn
                    ? isAvisado(buildHubOrderFlowKeyFromOsId(order.id))
                    : false;
                  const retirada = isDeliveryRetirada(order.delivery_type);

                  return (
                    <Card
                      key={order.id}
                      className={`space-y-3 p-4 ${avisado ? "border-emerald-500 bg-emerald-50/80" : ""}`}
                    >
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          OS #{order.os_number ?? "—"}
                        </p>
                        <Link href={`/os/${order.id}`}>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-left"
                          >
                            <span className="text-base font-semibold">
                              {order.customer_name}
                            </span>
                          </Button>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {order.title}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline">{order.payment_status}</Badge>
                        <span className="text-muted-foreground">
                          {formatDateTime(order.updated_at)}
                        </span>
                      </div>
                      <Select
                        value={order.status_id}
                        onValueChange={value => handleMove(order, value)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Mover para..." />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map(option => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isProntoAvisarColumn && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={avisado ? "default" : "outline"}
                            className={
                              avisado
                                ? "bg-emerald-600 text-white hover:bg-emerald-600"
                                : ""
                            }
                            disabled={pendingFlowKeys.includes(
                              buildHubOrderFlowKeyFromOsId(order.id)
                            )}
                            onClick={async event => {
                              event.stopPropagation();
                              const orderKey = buildHubOrderFlowKeyFromOsId(
                                order.id
                              );
                              setPendingFlowKeys(prev => [...prev, orderKey]);
                              try {
                                await setAvisado({
                                  sourceType: "os",
                                  sourceId: order.id,
                                });
                                toast.success(
                                  avisado
                                    ? `OS #${order.os_number ?? order.sale_number ?? "—"} desmarcada como avisada.`
                                    : `OS #${order.os_number ?? order.sale_number ?? "—"} marcada como avisada.`
                                );
                              } catch (error) {
                                console.error(error);
                                toast.error(
                                  "Falha ao atualizar status de aviso da OS."
                                );
                              } finally {
                                setPendingFlowKeys(prev =>
                                  prev.filter(key => key !== orderKey)
                                );
                              }
                            }}
                          >
                            AVISADO
                          </Button>
                          {retirada && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pendingFlowKeys.includes(
                                buildHubOrderFlowKeyFromOsId(order.id)
                              )}
                              onClick={async event => {
                                event.stopPropagation();
                                const orderKey = buildHubOrderFlowKeyFromOsId(
                                  order.id
                                );
                                setPendingFlowKeys(prev => [...prev, orderKey]);
                                try {
                                  await markRetirado({
                                    sourceType: "os",
                                    sourceId: order.id,
                                  });
                                  toast.success(
                                    `OS #${order.os_number ?? order.sale_number ?? "—"} marcada como retirada.`
                                  );
                                } catch (error) {
                                  console.error(error);
                                  toast.error(
                                    "Falha ao marcar OS como retirada."
                                  );
                                } finally {
                                  setPendingFlowKeys(prev =>
                                    prev.filter(key => key !== orderKey)
                                  );
                                }
                              }}
                            >
                              RETIRADO
                            </Button>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
