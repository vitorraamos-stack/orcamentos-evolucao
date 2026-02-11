import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  optimizeInstallationRoute,
  type OptimizeInstallationRouteResponse,
} from "@/features/hubos/api";
import { PROD_COLUMNS } from "@/features/hubos/constants";
import { cn } from "@/lib/utils";
import type { OsOrder } from "@/features/hubos/types";

type InstallationsInboxProps = {
  orders: OsOrder[];
  selectedId: string | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string | null) => void;
  onBack: () => void;
  onEdit: (order: OsOrder) => void;
  onOpenKanban: (order: OsOrder) => void;
};

type QuickFilter = "today" | "week" | "overdue" | "all";

const todayAsInput = () => {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
};

const formatDate = (value: string | null) => {
  if (!value) return "Sem data";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(year, month - 1, day)
  );
};

const formatDateWithWeekday = (value: string | null) => {
  if (!value) return "Sem data";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

const formatDistance = (meters: number) => `${(meters / 1000).toFixed(1)} km`;
const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
};

const getStatusLabel = (order: OsOrder) =>
  order.prod_status
    ? `Produção • ${order.prod_status}`
    : `Arte • ${order.art_status}`;

const FINAL_PROD_STATUS = PROD_COLUMNS[PROD_COLUMNS.length - 1];

const normalize = (value: string) => value.toLowerCase();

const parseDeliveryDate = (value: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isFinalized = (order: OsOrder) => order.prod_status === FINAL_PROD_STATUS;

const skippedReasonLabel: Record<string, string> = {
  missing_address: "Sem endereço cadastrado",
  geocode_failed: "Falha ao geocodificar endereço",
};

export default function InstallationsInbox({
  orders,
  selectedId,
  searchValue,
  onSearchChange,
  onSelect,
  onBack,
  onEdit,
  onOpenKanban,
}: InstallationsInboxProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayAsInput());
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [dateTo, setDateTo] = useState(todayAsInput());
  const [dateWindowDays, setDateWindowDays] = useState("1");
  const [geoClusterRadiusKm, setGeoClusterRadiusKm] = useState("5");
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState("20");
  const [startAddress, setStartAddress] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] =
    useState<OptimizeInstallationRouteResponse | null>(null);

  const selectedOrder = useMemo(
    () => orders.find(order => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const weekLimit = useMemo(() => {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 7);
    return limit;
  }, [today]);

  const searchFilteredOrders = useMemo(() => {
    const search = normalize(searchValue.trim());
    return orders.filter(order => {
      if (!search) return true;
      const description = order.description ?? "";
      return (
        normalize(order.sale_number).includes(search) ||
        normalize(order.client_name).includes(search) ||
        normalize(description).includes(search)
      );
    });
  }, [orders, searchValue]);

  useEffect(() => {
    const selectedByDate = orders
      .filter(order => order.delivery_date === dateFrom)
      .map(order => order.id);
    setSelectedOrderIds(selectedByDate);
  }, [dateFrom, orders]);

  const getIsToday = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery.getTime() === today.getTime();
    },
    [today]
  );

  const getIsOverdue = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery < today && !isFinalized(order);
    },
    [today]
  );

  const getIsWeek = useCallback(
    (order: OsOrder) => {
      const delivery = parseDeliveryDate(order.delivery_date);
      if (!delivery) return false;
      return delivery >= today && delivery <= weekLimit;
    },
    [today, weekLimit]
  );

  const quickFilterCounts = useMemo(
    () => ({
      today: searchFilteredOrders.filter(getIsToday).length,
      week: searchFilteredOrders.filter(getIsWeek).length,
      overdue: searchFilteredOrders.filter(getIsOverdue).length,
      all: searchFilteredOrders.length,
    }),
    [getIsOverdue, getIsToday, getIsWeek, searchFilteredOrders]
  );

  const filteredOrders = useMemo(() => {
    const filtered = searchFilteredOrders.filter(order => {
      if (quickFilter === "today") return getIsToday(order);
      if (quickFilter === "week") return getIsWeek(order);
      if (quickFilter === "overdue") return getIsOverdue(order);
      return true;
    });
    return filtered.sort((a, b) => {
      const overdueA = getIsOverdue(a);
      const overdueB = getIsOverdue(b);
      if (overdueA !== overdueB) return overdueA ? -1 : 1;

      const dateA = parseDeliveryDate(a.delivery_date);
      const dateB = parseDeliveryDate(b.delivery_date);
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }

      const updatedA = new Date(a.updated_at).getTime();
      const updatedB = new Date(b.updated_at).getTime();
      return updatedB - updatedA;
    });
  }, [getIsOverdue, getIsToday, getIsWeek, quickFilter, searchFilteredOrders]);

  useEffect(() => {
    if (!filteredOrders.length) {
      if (selectedId !== null) {
        onSelect(null);
      }
      return;
    }
    const stillExists = filteredOrders.some(order => order.id === selectedId);
    if (!selectedId || !stillExists) {
      onSelect(filteredOrders[0].id);
    }
  }, [filteredOrders, onSelect, selectedId]);

  const handleCopySummary = async () => {
    if (!selectedOrder) return;
    const summary = [
      `OS ${selectedOrder.sale_number} - ${selectedOrder.client_name}`,
      `Entrega: ${formatDate(selectedOrder.delivery_date)}`,
      `Endereço: ${selectedOrder.address || "(não informado)"}`,
      `Status: ${getStatusLabel(selectedOrder)}`,
      `Pedido: ${selectedOrder.description || "(sem descrição)"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Resumo copiado para a área de transferência.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível copiar o resumo.");
    }
  };

  const handleCopyAddress = async () => {
    if (!selectedOrder) return;
    if (!selectedOrder.address) {
      toast.error("Sem endereço para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedOrder.address);
      toast.success("Endereço copiado para a área de transferência.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível copiar o endereço.");
    }
  };

  const handleOpenWhatsapp = () => {
    if (!selectedOrder) return;
    const summary = `Instalação OS ${selectedOrder.sale_number} - ${selectedOrder.client_name} | Entrega: ${formatDate(
      selectedOrder.delivery_date
    )} | Endereço: ${selectedOrder.address || "(não informado)"}`;
    const url = `https://wa.me/?text=${encodeURIComponent(summary)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Abrindo WhatsApp...");
  };

  const handleOpenKanban = () => {
    if (!selectedOrder) return;
    onOpenKanban(selectedOrder);
  };

  const handleOptimizeRoute = async () => {
    setOptimizing(true);
    setResult(null);

    try {
      const payload = await optimizeInstallationRoute({
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        dateWindowDays: Number(dateWindowDays || 1),
        geoClusterRadiusKm: Number(geoClusterRadiusKm || 5),
        maxStopsPerRoute: Number(maxStopsPerRoute || 20),
        startAddress: startAddress.trim() || null,
        profile: "driving-car",
      });
      setResult(payload);
      toast.success("Rota otimizada com sucesso.");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Erro ao otimizar rota.";
      toast.error(message);
    } finally {
      setOptimizing(false);
    }
  };

  const filteredCountLabel = `${filteredOrders.length}/${orders.length}`;
  const hasOrders = orders.length > 0;
  const hasFiltered = filteredOrders.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            Instalações ({filteredCountLabel})
          </h2>
          <p className="text-sm text-muted-foreground">
            {orders.length} {orders.length === 1 ? "OS" : "OS"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDateFrom(todayAsInput());
              setDateTo(todayAsInput());
              setDateWindowDays("1");
              setGeoClusterRadiusKm("5");
              setMaxStopsPerRoute("20");
              setStartAddress("");
              setResult(null);
              setOptimizeOpen(true);
            }}
          >
            Otimizar rota
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Voltar
          </Button>
        </div>
      </div>

      <Dialog open={optimizeOpen} onOpenChange={setOptimizeOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Otimizar rota de instalações</DialogTitle>
            <DialogDescription>
              Selecione a data, escolha as OS e opcionalmente informe ponto de
              partida/chegada.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="route-date-from">Data inicial</Label>
              <Input
                id="route-date-from"
                type="date"
                value={dateFrom}
                onChange={event => setDateFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-date-to">Data final</Label>
              <Input
                id="route-date-to"
                type="date"
                value={dateTo}
                onChange={event => setDateTo(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-window">Janela de datas (dias)</Label>
              <Input
                id="route-window"
                type="number"
                min={0}
                value={dateWindowDays}
                onChange={event => setDateWindowDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-radius">Raio geográfico (km)</Label>
              <Input
                id="route-radius"
                type="number"
                min={1}
                value={geoClusterRadiusKm}
                onChange={event => setGeoClusterRadiusKm(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-max">Máx. paradas por rota</Label>
              <Input
                id="route-max"
                type="number"
                min={1}
                value={maxStopsPerRoute}
                onChange={event => setMaxStopsPerRoute(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route-start">Ponto de partida (opcional)</Label>
              <Input
                id="route-start"
                placeholder="Rua, número, bairro, cidade"
                value={startAddress}
                onChange={event => setStartAddress(event.target.value)}
              />
            </div>
          </div>

          {result && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">
                  Candidatas: {result.stats.totalCandidates}
                </Badge>
                <Badge variant="secondary">
                  Geocodadas: {result.stats.geocoded}
                </Badge>
                <Badge variant="outline">Grupos: {result.stats.groups}</Badge>
                <Badge variant="outline">Rotas: {result.stats.routes}</Badge>
              </div>

              {result.unassigned.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Não atribuídas</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {result.unassigned.map(item => {
                      const order = orders.find(
                        entry => entry.id === item.os_id
                      );
                      return (
                        <li key={`${item.os_id}-${item.reason}`}>
                          {order?.sale_number ?? item.os_id}:{" "}
                          {skippedReasonLabel[item.reason] ?? item.reason}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="space-y-3">
                {result.groups.map(group => (
                  <Card key={group.groupId} className="p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>{group.groupId}</Badge>
                      <Badge variant="outline">
                        {group.dateRange.from || "sem data"} até{" "}
                        {group.dateRange.to || "sem data"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {group.routes.map(route => (
                        <div
                          key={route.routeId}
                          className="rounded-md border p-2"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{route.routeId}</Badge>
                            <Badge variant="outline">
                              Distância:{" "}
                              {route.summary.distance_m
                                ? formatDistance(route.summary.distance_m)
                                : "n/d"}
                            </Badge>
                            <Badge variant="outline">
                              Tempo:{" "}
                              {route.summary.duration_s
                                ? formatDuration(route.summary.duration_s)
                                : "n/d"}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!route.googleMapsUrl}
                              onClick={() =>
                                route.googleMapsUrl &&
                                window.open(
                                  route.googleMapsUrl,
                                  "_blank",
                                  "noopener,noreferrer"
                                )
                              }
                            >
                              Abrir no Google Maps
                            </Button>
                          </div>
                          <ol className="space-y-1 text-sm">
                            {route.stops.map(stop => (
                              <li
                                key={stop.os_id}
                                className="rounded-md border p-2"
                              >
                                <p className="font-medium">
                                  #{stop.sequence} • {stop.client_name} (
                                  {stop.sale_number})
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {stop.address || "Sem endereço"} •{" "}
                                  {stop.delivery_date || "Sem data"}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOptimizeOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleOptimizeRoute} disabled={optimizing}>
              {optimizing ? "Otimizando..." : "Gerar rota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full flex-col gap-3 lg:w-[380px] lg:min-w-[360px] lg:max-w-[420px]">
          <Input
            placeholder="Pesquisar..."
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={quickFilter === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("today")}
            >
              Hoje ({quickFilterCounts.today})
            </Button>
            <Button
              type="button"
              variant={quickFilter === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("week")}
            >
              Esta semana ({quickFilterCounts.week})
            </Button>
            <Button
              type="button"
              variant={quickFilter === "overdue" ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("overdue")}
            >
              Atrasadas ({quickFilterCounts.overdue})
            </Button>
            <Button
              type="button"
              variant={quickFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("all")}
            >
              Todas ({quickFilterCounts.all})
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {!hasOrders ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhuma OS marcada como Instalação.
              </Card>
            ) : !hasFiltered ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Nenhum resultado para sua busca.
              </Card>
            ) : (
              filteredOrders.map(order => {
                const isSelected = order.id === selectedId;
                const isOverdue = getIsOverdue(order);
                const isToday = getIsToday(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelect(order.id)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "hover:border-muted-foreground/40 hover:bg-muted/40",
                      isOverdue && "border-l-4 border-l-destructive"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {order.sale_number} - {order.client_name}
                      </div>
                      {order.delivery_date && (
                        <div className="rounded-md border border-yellow-200 bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900 animate-pulse [animation-duration:3s]">
                          {formatDateWithWeekday(order.delivery_date)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{getStatusLabel(order)}</Badge>
                      {isOverdue && (
                        <Badge variant="destructive">ATRASADA</Badge>
                      )}
                      {isToday && <Badge>HOJE</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {order.delivery_date && (
                        <Badge variant="outline">
                          Entrega: {formatDate(order.delivery_date)}
                        </Badge>
                      )}
                      <Badge>Instalação</Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <Card className="flex-1 p-5">
          {!selectedOrder ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              Selecione uma OS...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold">
                    {selectedOrder.sale_number} - {selectedOrder.client_name}
                  </h3>
                  {selectedOrder.delivery_date && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-100 px-2 py-1 text-[11px] font-semibold text-yellow-900 animate-pulse [animation-duration:3s]">
                      {formatDateWithWeekday(selectedOrder.delivery_date)}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {getStatusLabel(selectedOrder)}
                  </Badge>
                  {getIsOverdue(selectedOrder) && (
                    <Badge variant="destructive">ATRASADA</Badge>
                  )}
                  {getIsToday(selectedOrder) && <Badge>HOJE</Badge>}
                </div>
              </div>

              <div className="grid gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Descrição detalhada
                  </p>
                  <p>{selectedOrder.description || "(sem descrição)"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Data de entrega
                  </p>
                  <p>{formatDate(selectedOrder.delivery_date)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Endereço
                  </p>
                  <p>{selectedOrder.address || "(não informado)"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Flags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.reproducao && (
                      <Badge variant="secondary">Reprodução</Badge>
                    )}
                    {selectedOrder.letra_caixa && (
                      <Badge variant="secondary">Letra caixa</Badge>
                    )}
                    {!selectedOrder.reproducao &&
                      !selectedOrder.letra_caixa && (
                        <span className="text-muted-foreground">(nenhuma)</span>
                      )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onEdit(selectedOrder)}>Editar</Button>
                <Button variant="outline" onClick={handleOpenKanban}>
                  Abrir no Kanban
                </Button>
                <Button variant="outline" onClick={handleCopySummary}>
                  Copiar resumo
                </Button>
                <Button variant="outline" onClick={handleCopyAddress}>
                  Copiar endereço
                </Button>
                <Button variant="outline" onClick={handleOpenWhatsapp}>
                  Abrir WhatsApp
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
