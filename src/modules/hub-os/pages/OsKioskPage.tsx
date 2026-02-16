import { ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  createOrderEvent,
  fetchOrderById,
  updateOrder,
} from "@/features/hubos/api";
import type { OsOrder } from "@/features/hubos/types";
import {
  createOsEvent,
  fetchOsByCode,
  fetchOsById,
  type KioskLookupResult,
  updateOs,
} from "../api";
import { KioskOsLookupPanel } from "../kiosk/KioskOsLookupPanel";
import type { DeliveryType, Os } from "../types";

type KioskOrder = {
  key: string;
  source: KioskLookupResult["source"];
  legacyOrder?: Os;
  hubOrder?: OsOrder;
};

type KioskDestination = "retirada" | "entrega" | "instalacao";

type KioskSummaryCategory = "instalacoes" | "prontoAvisar" | "logistica";

type KioskPersistedState = {
  version: number;
  listaOSAcabamentoEntregaRetirada: KioskOrder[];
  listaOSAcabamentoInstalacao: KioskOrder[];
  listaOSEmbalagem: KioskOrder[];
  listaInstalacoes: KioskOrder[];
  listaProntoAvisar: KioskOrder[];
  listaLogistica: KioskOrder[];
  materialProntoIds: string[];
};

const KIOSK_STORAGE_KEY = "hubos:kiosk:state:v2";

const KIOSK_STATUS_DESTINATIONS = {
  retirada: {
    legacy: "PRONTO/AVISAR",
    hub: "Pronto / Avisar Cliente",
  },
  entrega: {
    legacy: "Logística",
    hub: "Logística (Entrega/Transportadora)",
  },
  instalacao: {
    legacy: "Instalação Agendada",
    hub: "Instalação Agendada",
  },
} as const;

const getOrderTag = (order: KioskOrder): DeliveryType | null => {
  if (order.source === "os") {
    return order.legacyOrder?.delivery_type ?? null;
  }

  if (!order.hubOrder) return null;
  if (order.hubOrder.logistic_type === "entrega") return "ENTREGA";
  if (order.hubOrder.logistic_type === "retirada") return "RETIRADA";
  return "INSTALACAO";
};

const toTagLabel = (tag: DeliveryType | null) => {
  if (tag === "ENTREGA") return "Entrega";
  if (tag === "RETIRADA") return "Retirada";
  return "Instalação";
};

const formatDatePtBr = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
};

const getKioskOrderTitle = (order: KioskOrder) => {
  if (order.source === "os") {
    const legacyOrder = order.legacyOrder;
    if (!legacyOrder) return "Sem título";
    return (
      legacyOrder.title ||
      `${legacyOrder.sale_number ?? ""} - ${legacyOrder.client_name}`.trim()
    );
  }

  const hubOrder = order.hubOrder;
  if (!hubOrder) return "Sem título";
  return (
    hubOrder.title || `${hubOrder.sale_number} - ${hubOrder.client_name}`.trim()
  );
};

const getOrderDisplayNumber = (order: KioskOrder) => {
  if (order.source === "os") {
    return (
      order.legacyOrder?.os_number ?? order.legacyOrder?.sale_number ?? "—"
    );
  }

  return order.hubOrder?.os_number ?? order.hubOrder?.sale_number ?? "—";
};

const getOrderClientName = (order: KioskOrder) => {
  if (order.source === "os") {
    return (
      order.legacyOrder?.client_name || order.legacyOrder?.customer_name || "—"
    );
  }
  return order.hubOrder?.client_name ?? "—";
};

const getOrderDeliveryDate = (order: KioskOrder) => {
  if (order.source === "os") return order.legacyOrder?.delivery_date ?? null;
  return order.hubOrder?.delivery_date ?? null;
};

const getOrderAddress = (order: KioskOrder) => {
  if (order.source === "os") return order.legacyOrder?.address ?? null;
  return order.hubOrder?.address ?? null;
};

const getOrderDescription = (order: KioskOrder) => {
  if (order.source === "os") {
    return order.legacyOrder?.description ?? order.legacyOrder?.notes ?? null;
  }
  return order.hubOrder?.description ?? null;
};

const getOrderProductionStatus = (order: KioskOrder) => {
  if (order.source === "os") return order.legacyOrder?.status_producao ?? "—";
  return order.hubOrder?.prod_status ?? "—";
};

const isEntregaOrRetiradaTag = (tag: DeliveryType | null) =>
  tag === "ENTREGA" || tag === "RETIRADA";

const upsertList = (items: KioskOrder[], nextOrder: KioskOrder) => {
  if (items.some(item => item.key === nextOrder.key)) {
    return items.map(item => (item.key === nextOrder.key ? nextOrder : item));
  }
  return [nextOrder, ...items];
};


export default function OsKioskPage() {
  const { user } = useAuth();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<KioskOrder | null>(null);
  const [fullscreenBlocked, setFullscreenBlocked] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [materialProntoIds, setMaterialProntoIds] = useState<string[]>([]);
  const [
    listaOSAcabamentoEntregaRetirada,
    setListaOSAcabamentoEntregaRetirada,
  ] = useState<KioskOrder[]>([]);
  const [listaOSAcabamentoInstalacao, setListaOSAcabamentoInstalacao] =
    useState<KioskOrder[]>([]);
  const [listaOSEmbalagem, setListaOSEmbalagem] = useState<KioskOrder[]>([]);
  const [listaInstalacoes, setListaInstalacoes] = useState<KioskOrder[]>([]);
  const [listaProntoAvisar, setListaProntoAvisar] = useState<KioskOrder[]>([]);
  const [listaLogistica, setListaLogistica] = useState<KioskOrder[]>([]);
  const [summaryModalCategory, setSummaryModalCategory] =
    useState<KioskSummaryCategory | null>(null);

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
    try {
      const rawState = localStorage.getItem(KIOSK_STORAGE_KEY);
      if (!rawState) return;
      const parsedState = JSON.parse(rawState) as KioskPersistedState;
      if (!parsedState || parsedState.version !== 2) return;

      setListaOSAcabamentoEntregaRetirada(
        parsedState.listaOSAcabamentoEntregaRetirada ?? []
      );
      setListaOSAcabamentoInstalacao(
        parsedState.listaOSAcabamentoInstalacao ?? []
      );
      setListaOSEmbalagem(parsedState.listaOSEmbalagem ?? []);
      setListaInstalacoes(parsedState.listaInstalacoes ?? []);
      setListaProntoAvisar(parsedState.listaProntoAvisar ?? []);
      setListaLogistica(parsedState.listaLogistica ?? []);
      setMaterialProntoIds(parsedState.materialProntoIds ?? []);
    } catch (error) {
      console.error("Falha ao carregar estado do quiosque:", error);
    }
  }, []);

  useEffect(() => {
    const payload: KioskPersistedState = {
      version: 2,
      listaOSAcabamentoEntregaRetirada,
      listaOSAcabamentoInstalacao,
      listaOSEmbalagem,
      listaInstalacoes,
      listaProntoAvisar,
      listaLogistica,
      materialProntoIds,
    };
    localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(payload));
  }, [
    listaOSAcabamentoEntregaRetirada,
    listaOSAcabamentoInstalacao,
    listaOSEmbalagem,
    listaInstalacoes,
    listaProntoAvisar,
    listaLogistica,
    materialProntoIds,
  ]);

  const addOrderToColumns = (order: KioskOrder) => {
    const tag = getOrderTag(order);

    if (tag === "INSTALACAO") {
      setListaOSAcabamentoInstalacao(prev => upsertList(prev, order));
      return;
    }

    if (isEntregaOrRetiradaTag(tag)) {
      setListaOSAcabamentoEntregaRetirada(prev => upsertList(prev, order));
    }
  };

  const moverParaEmbalagem = (order: KioskOrder) => {
    setListaOSEmbalagem(prev => upsertList(prev, order));
    toast.success("OS movida para Embalagem.");
  };

  const resolveKioskOrder = async (lookup: KioskLookupResult) => {
    if (lookup.source === "os") {
      const legacyOrder = await fetchOsById(lookup.id);
      return {
        key: `os:${lookup.id}`,
        source: lookup.source,
        legacyOrder,
      } as KioskOrder;
    }

    const hubOrder = await fetchOrderById(lookup.id);
    return {
      key: `os_orders:${lookup.id}`,
      source: lookup.source,
      hubOrder,
    } as KioskOrder;
  };

  const handleAddByCode = async (sanitizedCode: string) => {
    const lookup = await fetchOsByCode(sanitizedCode);
    if (!lookup) {
      throw new Error("OS não encontrada. Verifique o número da etiqueta.");
    }

    const kioskOrder = await resolveKioskOrder(lookup);
    addOrderToColumns(kioskOrder);
    setAddModalOpen(false);
    toast.success(
      `OS #${getOrderDisplayNumber(kioskOrder)} adicionada ao quiosque.`
    );
  };

  const moverOS = async (order: KioskOrder, destino: KioskDestination) => {
    try {
      setProcessingId(order.key);
      const currentTag = getOrderTag(order);

      let updatedOrder: KioskOrder = order;

      if (order.source === "os" && order.legacyOrder) {
        const updatedLegacyOrder = await updateOs(order.legacyOrder.id, {
          status_producao: KIOSK_STATUS_DESTINATIONS[destino].legacy,
          updated_at: new Date().toISOString(),
        });

        await createOsEvent({
          os_id: order.legacyOrder.id,
          type: "status_producao_changed",
          payload: {
            from: order.legacyOrder.status_producao,
            to: KIOSK_STATUS_DESTINATIONS[destino].legacy,
            source: "kiosk",
          },
          created_by: user?.id ?? null,
        });

        updatedOrder = {
          ...order,
          legacyOrder: updatedLegacyOrder,
        };
      }

      if (order.source === "os_orders" && order.hubOrder) {
        const updatedHubOrder = await updateOrder(order.hubOrder.id, {
          prod_status: KIOSK_STATUS_DESTINATIONS[destino].hub,
          production_tag: destino === "instalacao" ? "PRONTO" : order.hubOrder.production_tag,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        });

        await createOrderEvent({
          os_id: order.hubOrder.id,
          type: "prod_status_changed",
          payload: {
            from: order.hubOrder.prod_status,
            to: KIOSK_STATUS_DESTINATIONS[destino].hub,
            source: "kiosk",
          },
          created_by: user?.id ?? null,
        });

        updatedOrder = {
          ...order,
          hubOrder: updatedHubOrder,
        };
      }

      setListaOSAcabamentoEntregaRetirada(prev =>
        prev.filter(item => item.key !== order.key)
      );
      setListaOSAcabamentoInstalacao(prev =>
        prev.filter(item => item.key !== order.key)
      );

      if (destino === "instalacao") {
        setMaterialProntoIds(prev =>
          prev.includes(order.key) ? prev : [...prev, order.key]
        );
        setListaInstalacoes(prev => upsertList(prev, updatedOrder));
      }

      if (destino === "retirada" && isEntregaOrRetiradaTag(currentTag)) {
        setListaProntoAvisar(prev => upsertList(prev, updatedOrder));
        setListaOSEmbalagem(prev => prev.filter(item => item.key !== order.key));
      }

      if (destino === "entrega" && isEntregaOrRetiradaTag(currentTag)) {
        setListaLogistica(prev => upsertList(prev, updatedOrder));
        setListaOSEmbalagem(prev =>
          prev.filter(item => item.key !== order.key)
        );
      }

      setSelectedOrder(current =>
        current?.key === order.key ? updatedOrder : current
      );
      toast.success(`Movido para ${KIOSK_STATUS_DESTINATIONS[destino].hub}.`);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao mover a OS. Tente novamente.");
    } finally {
      setProcessingId(null);
    }
  };

  const totalCards = useMemo(
    () =>
      listaOSAcabamentoEntregaRetirada.length +
      listaOSAcabamentoInstalacao.length +
      listaOSEmbalagem.length +
      listaInstalacoes.length +
      listaProntoAvisar.length +
      listaLogistica.length,
    [
      listaOSAcabamentoEntregaRetirada.length,
      listaOSAcabamentoInstalacao.length,
      listaOSEmbalagem.length,
      listaInstalacoes.length,
      listaProntoAvisar.length,
      listaLogistica.length,
    ]
  );

  const AddOrderButton = ({ label }: { label: string }) => (
    <button
      type="button"
      className="group flex min-h-11 items-center gap-3 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-left transition hover:bg-primary/20"
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
    { title: string; orders: KioskOrder[] }
  > = {
    instalacoes: { title: "Instalações", orders: listaInstalacoes },
    prontoAvisar: { title: "Pronto/Avisar", orders: listaProntoAvisar },
    logistica: { title: "Logística", orders: listaLogistica },
  };

  const summaryModalData = summaryModalCategory
    ? kioskSummaryConfig[summaryModalCategory]
    : null;

  const renderOrderCard = (order: KioskOrder, children?: ReactNode) => (
    <Card
      key={order.key}
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
      className="space-y-3 p-3 transition hover:border-primary/60 hover:bg-muted/20"
    >
      <p className="text-xs text-muted-foreground">
        OS #{getOrderDisplayNumber(order)}
      </p>
      <p className="font-semibold">{getKioskOrderTitle(order)}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{toTagLabel(getOrderTag(order))}</Badge>
      </div>
      {children}
    </Card>
  );

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
          </div>
          <Badge variant="secondary">{totalCards} OS em exibição</Badge>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setSummaryModalCategory("instalacoes")}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setSummaryModalCategory("instalacoes");
            }}
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
            onClick={() => setSummaryModalCategory("prontoAvisar")}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setSummaryModalCategory("prontoAvisar");
            }}
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
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              setSummaryModalCategory("logistica");
            }}
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
                  {listaOSAcabamentoEntregaRetirada.length === 0 && (
                    <Card className="p-3 text-xs text-muted-foreground">
                      Nenhuma OS.
                    </Card>
                  )}
                  {listaOSAcabamentoEntregaRetirada.map(order =>
                    renderOrderCard(
                      order,
                      <Button
                        disabled={processingId === order.key}
                        onClick={event => {
                          event.stopPropagation();
                          moverParaEmbalagem(order);
                        }}
                      >
                        Pronto para embalar
                      </Button>
                    )
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
                  {listaOSAcabamentoInstalacao.length === 0 && (
                    <Card className="p-3 text-xs text-muted-foreground">
                      Nenhuma OS.
                    </Card>
                  )}
                  {listaOSAcabamentoInstalacao.map(order =>
                    renderOrderCard(
                      order,
                      <>
                        {materialProntoIds.includes(order.key) ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Material Pronto
                          </Badge>
                        ) : null}
                        <Button
                          disabled={processingId === order.key}
                          onClick={event => {
                            event.stopPropagation();
                            void moverOS(order, "instalacao");
                          }}
                        >
                          Pronto para a Instalação
                        </Button>
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
              {listaOSEmbalagem.length === 0 && (
                <Card className="p-3 text-xs text-muted-foreground">
                  Nenhuma OS.
                </Card>
              )}
              {listaOSEmbalagem.map(order => {
                const tag = getOrderTag(order);
                return renderOrderCard(
                  order,
                  <>
                    {tag === "RETIRADA" ? (
                      <Button
                        disabled={processingId === order.key}
                        onClick={event => {
                          event.stopPropagation();
                          void moverOS(order, "retirada");
                        }}
                      >
                        Pronto para a retirada
                      </Button>
                    ) : null}

                    {tag === "ENTREGA" ? (
                      <Button
                        disabled={processingId === order.key}
                        onClick={event => {
                          event.stopPropagation();
                          void moverOS(order, "entrega");
                        }}
                      >
                        Pronto para a logística
                      </Button>
                    ) : null}
                  </>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={summaryModalCategory !== null}
        onOpenChange={open => {
          if (!open) setSummaryModalCategory(null);
        }}
      >
        <DialogContent className="h-[82vh] w-[94vw] max-w-[1280px] p-6">
          {summaryModalData ? (
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold">{summaryModalData.title}</h3>
                <Badge variant="secondary">
                  {summaryModalData.orders.length} OS
                </Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {summaryModalData.orders.length === 0 ? (
                  <Card className="p-4 text-sm text-muted-foreground">
                    Nenhuma OS.
                  </Card>
                ) : (
                  summaryModalData.orders.map(order => (
                    <Card
                      key={order.key}
                      className="grid gap-3 p-4 md:grid-cols-[220px_1fr]"
                    >
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">OS</p>
                        <p className="text-lg font-semibold">
                          #{getOrderDisplayNumber(order)}
                        </p>
                        <Badge variant="outline">{toTagLabel(getOrderTag(order))}</Badge>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold">{getKioskOrderTitle(order)}</p>
                        <p className="text-sm text-muted-foreground">
                          {getOrderDescription(order) ?? "Sem descrição."}
                        </p>
                      </div>
                    </Card>
                  ))
                )}
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

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[92vw] max-w-[820px] p-6">
          {selectedOrder ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold">
                  OS #{getOrderDisplayNumber(selectedOrder)}
                </h3>
                <p className="text-muted-foreground">
                  {getKioskOrderTitle(selectedOrder)}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-medium">
                    {getOrderClientName(selectedOrder)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Tag logística</p>
                  <p className="font-medium">
                    {toTagLabel(getOrderTag(selectedOrder))}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Data de entrega
                  </p>
                  <p className="font-medium">
                    {formatDatePtBr(getOrderDeliveryDate(selectedOrder))}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Status Produção
                  </p>
                  <p className="font-medium">
                    {getOrderProductionStatus(selectedOrder)}
                  </p>
                </div>
                <div className="rounded-md border p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Endereço</p>
                  <p className="font-medium">
                    {getOrderAddress(selectedOrder) ?? "—"}
                  </p>
                </div>
                <div className="rounded-md border p-3 sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Descrição / Observações
                  </p>
                  <p className="whitespace-pre-wrap font-medium">
                    {getOrderDescription(selectedOrder) ?? "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
