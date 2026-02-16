import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fetchOsById, fetchOsByCode, updateOs, createOsEvent } from "../api";
import type { DeliveryType, Os } from "../types";
import { KioskOsLookupPanel } from "../kiosk/KioskOsLookupPanel";
import { useAuth } from "@/contexts/AuthContext";

const toTagLabel = (deliveryType: DeliveryType | null) => {
  if (deliveryType === "ENTREGA") return "Entrega";
  if (deliveryType === "RETIRADA") return "Retirada";
  return "Instalação";
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
  ] = useState<Os[]>([]);
  const [listaOSAcabamentoInstalacao, setListaOSAcabamentoInstalacao] =
    useState<Os[]>([]);
  const [listaOSEmbalagem, setListaOSEmbalagem] = useState<Os[]>([]);

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

  const upsertList = (items: Os[], order: Os) => {
    if (items.some(item => item.id === order.id)) {
      return items.map(item => (item.id === order.id ? order : item));
    }
    return [order, ...items];
  };

  const addOrderToColumns = (order: Os) => {
    if (order.delivery_type === "INSTALACAO") {
      setListaOSAcabamentoInstalacao(prev => upsertList(prev, order));
      return;
    }

    if (isEntregaOuRetirada(order.delivery_type)) {
      setListaOSAcabamentoEntregaRetirada(prev => upsertList(prev, order));
      setListaOSEmbalagem(prev => upsertList(prev, order));
    }
  };

  const handleAddByCode = async (sanitizedCode: string) => {
    const lookup = await fetchOsByCode(sanitizedCode);
    if (!lookup || lookup.source !== "os") {
      throw new Error("OS não encontrada. Verifique o número da etiqueta.");
    }

    const order = await fetchOsById(lookup.id);
    addOrderToColumns(order);
    setAddModalOpen(false);
    toast.success(
      `OS #${order.os_number ?? order.sale_number ?? "—"} adicionada ao quiosque.`
    );
  };

  const moverOS = async (order: Os, destino: string) => {
    try {
      setProcessingId(order.id);
      const updatedOrder = await updateOs(order.id, {
        status_producao: destino,
        updated_at: new Date().toISOString(),
      });

      await createOsEvent({
        os_id: order.id,
        type: "status_producao_changed",
        payload: { from: order.status_producao, to: destino, source: "kiosk" },
        created_by: user?.id ?? null,
      });

      setListaOSAcabamentoEntregaRetirada(prev =>
        prev.map(item => (item.id === order.id ? updatedOrder : item))
      );
      setListaOSAcabamentoInstalacao(prev =>
        prev.map(item => (item.id === order.id ? updatedOrder : item))
      );

      if (destino === KIOSK_DESTINATIONS.instalacao) {
        setMaterialProntoIds(prev =>
          prev.includes(order.id) ? prev : [...prev, order.id]
        );
      }

      if (
        destino === KIOSK_DESTINATIONS.entrega ||
        destino === KIOSK_DESTINATIONS.retirada
      ) {
        setListaOSEmbalagem(prev => prev.filter(item => item.id !== order.id));
      }

      toast.success(`Movido para ${destino}.`);
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
                    <Card key={order.id} className="space-y-2 p-3">
                      <p className="text-xs text-muted-foreground">
                        OS #{order.os_number ?? order.sale_number ?? "—"}
                      </p>
                      <p className="font-semibold">{getOrderTitle(order)}</p>
                      <Badge variant="secondary">
                        {toTagLabel(order.delivery_type)}
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
                    <Card key={order.id} className="space-y-3 p-3">
                      <p className="text-xs text-muted-foreground">
                        OS #{order.os_number ?? order.sale_number ?? "—"}
                      </p>
                      <p className="font-semibold">{getOrderTitle(order)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Instalação</Badge>
                        {materialProntoIds.includes(order.id) ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Material Pronto
                          </Badge>
                        ) : null}
                      </div>
                      <Button
                        disabled={processingId === order.id}
                        onClick={() =>
                          void moverOS(order, KIOSK_DESTINATIONS.instalacao)
                        }
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
              {listaOSEmbalagem.map(order => (
                <Card key={order.id} className="space-y-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    OS #{order.os_number ?? order.sale_number ?? "—"}
                  </p>
                  <p className="font-semibold">{getOrderTitle(order)}</p>
                  <Badge variant="secondary">
                    {toTagLabel(order.delivery_type)}
                  </Badge>

                  {order.delivery_type === "RETIRADA" ? (
                    <Button
                      disabled={processingId === order.id}
                      onClick={() =>
                        void moverOS(order, KIOSK_DESTINATIONS.retirada)
                      }
                    >
                      Pronto para a retirada
                    </Button>
                  ) : null}

                  {order.delivery_type === "ENTREGA" ? (
                    <Button
                      disabled={processingId === order.id}
                      onClick={() =>
                        void moverOS(order, KIOSK_DESTINATIONS.entrega)
                      }
                    >
                      Pronto para a entrega
                    </Button>
                  ) : null}
                </Card>
              ))}
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
