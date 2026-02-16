import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchOrderById,
  updateOrder,
  createOrderEvent,
} from "@/features/hubos/api";
import type { OsOrder } from "@/features/hubos/types";
import {
  fetchOsById,
  fetchOsByCode,
  updateOs,
  createOsEvent,
  type KioskLookupResult,
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

const isEntregaOrRetiradaTag = (tag: DeliveryType | null) =>
  tag === "ENTREGA" || tag === "RETIRADA";

const upsertList = (items: KioskOrder[], nextOrder: KioskOrder) => {
  if (items.some(item => item.key === nextOrder.key)) {
    return items.map(item => (item.key === nextOrder.key ? nextOrder : item));
  }
  return [nextOrder, ...items];
};

const isEntregaOuRetirada = (deliveryType: DeliveryType | null) =>
  deliveryType === "ENTREGA" || deliveryType === "RETIRADA";

const getOrderTitle = (order: Os) =>
  order.title || `${order.sale_number ?? ""} - ${order.client_name}`.trim();

const KIOSK_DESTINATIONS = {
  retirada: "PRONTO/AVISAR",
  entrega: "Logística",
  instalacao: "Instalação Agendada",
} as const;

export default function OsKioskPage() {
  const { user } = useAuth();
  const [addModalOpen, setAddModalOpen] = useState(false);
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

  const addOrderToColumns = (order: KioskOrder) => {
    const tag = getOrderTag(order);

    if (tag === "INSTALACAO") {
      setListaOSAcabamentoInstalacao(prev => upsertList(prev, order));
      return;
    }

    if (isEntregaOrRetiradaTag(tag)) {
      setListaOSAcabamentoEntregaRetirada(prev => upsertList(prev, order));
      setListaOSEmbalagem(prev => upsertList(prev, order));
    }
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
        prev.map(item => (item.key === order.key ? updatedOrder : item))
      );
      setListaOSAcabamentoInstalacao(prev =>
        prev.map(item => (item.key === order.key ? updatedOrder : item))
      );

      if (destino === "instalacao") {
        setMaterialProntoIds(prev =>
          prev.includes(order.key) ? prev : [...prev, order.key]
        );
      }

      if (
        (destino === "entrega" || destino === "retirada") &&
        isEntregaOrRetiradaTag(currentTag)
      ) {
        setListaOSEmbalagem(prev =>
          prev.filter(item => item.key !== order.key)
        );
      }

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
      listaOSEmbalagem.length,
    [
      listaOSAcabamentoEntregaRetirada.length,
      listaOSAcabamentoInstalacao.length,
      listaOSEmbalagem.length,
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
                  {listaOSAcabamentoEntregaRetirada.map(order => (
                    <Card key={order.key} className="space-y-2 p-3">
                      <p className="text-xs text-muted-foreground">
                        OS #{getOrderDisplayNumber(order)}
                      </p>
                      <p className="font-semibold">
                        {getKioskOrderTitle(order)}
                      </p>
                      <Badge variant="secondary">
                        {toTagLabel(getOrderTag(order))}
                      </Badge>
                    </Card>
                  ))}
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
                  {listaOSAcabamentoInstalacao.map(order => (
                    <Card key={order.key} className="space-y-3 p-3">
                      <p className="text-xs text-muted-foreground">
                        OS #{getOrderDisplayNumber(order)}
                      </p>
                      <p className="font-semibold">
                        {getKioskOrderTitle(order)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Instalação</Badge>
                        {materialProntoIds.includes(order.key) ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Material Pronto
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        disabled={processingId === order.key}
                        onClick={() => void moverOS(order, "instalacao")}
                      >
                        Pronto para a Instalação
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Embalagem</h2>
              <AddOrderButton label="ADICIONAR NOVA OS" />
            </div>

            <div className="space-y-2">
              {listaOSEmbalagem.length === 0 && (
                <Card className="p-3 text-xs text-muted-foreground">
                  Nenhuma OS.
                </Card>
              )}
              {listaOSEmbalagem.map(order => {
                const tag = getOrderTag(order);
                return (
                  <Card key={order.key} className="space-y-3 p-3">
                    <p className="text-xs text-muted-foreground">
                      OS #{getOrderDisplayNumber(order)}
                    </p>
                    <p className="font-semibold">{getKioskOrderTitle(order)}</p>
                    <Badge variant="secondary">{toTagLabel(tag)}</Badge>

                    {tag === "RETIRADA" ? (
                      <Button
                        disabled={processingId === order.key}
                        onClick={() => void moverOS(order, "retirada")}
                      >
                        Pronto para a retirada
                      </Button>
                    ) : null}

                    {tag === "ENTREGA" ? (
                      <Button
                        disabled={processingId === order.key}
                        onClick={() => void moverOS(order, "entrega")}
                      >
                        Pronto para a entrega
                      </Button>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

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
