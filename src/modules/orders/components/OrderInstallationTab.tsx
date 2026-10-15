import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrderDeliverySummary, OrderPickupSummary, installationExecutionViewState } from "./OrderLogisticsSummary";
import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";
import {
  buildMapsUrl,
  buildWazeUrl,
  INSTALLATION_STATUS_LABEL,
  formatAgendaDate,
  selectPrimaryInstallation,
} from "@/modules/installations/services/installations";
import { loadInstallationsForOrder } from "@/modules/installations/repositories/installationsRepository";
import { loadInstallationExecution } from "@/modules/installations/repositories/installationExecutionRepository";
import { InstallationChecklist } from "@/modules/installations/components/InstallationChecklist";
import { InstallationEvidenceGallery } from "@/modules/installations/components/InstallationEvidenceGallery";
import type {
  InstallationChecklistItem,
  InstallationEvidence,
} from "@/modules/installations/types";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/modules/installations/types";
import type { Delivery } from "@/modules/deliveries/types";
import type { HubOrderFlowRow } from "@/modules/hub-os/order-flow-api";

export function OrderInstallationTab({ order }: { order: OsOrder }) {
  const [record, setRecord] = useState<
    Installation | Delivery | HubOrderFlowRow | null
  >(null);
  const [installationHistory, setInstallationHistory] = useState<
    Installation[]
  >([]);
  const [fieldData, setFieldData] = useState<{
    installationId: string | null;
    status: "idle" | "loading" | "ready" | "error";
    checklist: InstallationChecklistItem[];
    evidence: InstallationEvidence[];
  }>({ installationId: null, status: "idle", checklist: [], evidence: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [executionReloadKey, setExecutionReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setRecord(null);
    setInstallationHistory([]);
    void (async () => {
      try {
      if (order.logistic_type === "instalacao") {
        const rows = await loadInstallationsForOrder(order.id);
        if (alive) {
          setInstallationHistory(rows);
          setRecord(selectPrimaryInstallation(rows));
        }
        return;
      }
      const query =
        order.logistic_type === "entrega"
          ? supabase
              .from("os_deliveries")
              .select("*")
              .eq("os_id", order.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : supabase
              .from("hub_os_order_flow_state")
              .select("*")
              .eq("source_type", "os_orders")
              .eq("source_id", order.id)
              .maybeSingle();
      const { data, error } = await query;
      if (error) throw error;
      if (alive) setRecord(data as typeof record);
      } catch {
        if (alive) setLoadError("Não foi possível carregar os dados de logística. Tente novamente.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [order.id, order.logistic_type, reloadKey]);
  const installation =
    order.logistic_type === "instalacao" &&
    (record as Installation | null)?.os_id === order.id
      ? (record as Installation)
      : null;
  const primaryInstallationId = installation?.id ?? null;

  // The agenda is independent from checklist and evidence loading. A failed
  // field-data request can be retried without querying the agenda again.
  useEffect(() => {
    let alive = true;
    if (!primaryInstallationId) {
      setFieldData({ installationId: null, status: "idle", checklist: [], evidence: [] });
      return () => { alive = false; };
    }
    const primary = { id: primaryInstallationId };
    setFieldData({ installationId: primary.id, status: "loading", checklist: [], evidence: [] });
    void loadInstallationExecution(primary.id)
      .then(data => {
        if (alive) setFieldData({
          installationId: primary.id,
          status: "ready",
          checklist: data.checklist,
          evidence: data.evidence,
        });
      })
      .catch(() => {
        if (alive) setFieldData({
          installationId: primary.id,
          status: "error",
          checklist: [],
          evidence: [],
        });
      });
    return () => { alive = false; };
  }, [primaryInstallationId, executionReloadKey]);

  const fieldView = installationExecutionViewState(fieldData, primaryInstallationId);
  const delivery =
    order.logistic_type === "entrega" &&
    (record as Delivery | null)?.os_id === order.id
      ? (record as Delivery)
      : null;
  const pickup =
    order.logistic_type === "retirada" &&
    (record as HubOrderFlowRow | null)?.source_id === order.id
      ? (record as HubOrderFlowRow)
      : null;
  const address = installation?.address_snapshot || order.address;
  const previousInstallations = installationHistory.filter(
    row => row.id !== installation?.id
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.logistic_type === "instalacao" ? "Instalação" : order.logistic_type === "entrega" ? "Entrega" : order.logistic_type === "retirada" ? "Retirada" : "Instalação / Entrega"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando informações de logística…
          </p>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
            <p className="min-w-0 text-sm text-destructive">{loadError}</p>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setReloadKey(key => key + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
        {installation ? (
          <>
            <div>
              <span className="text-sm text-muted-foreground">Status: </span>
              <Badge>{INSTALLATION_STATUS_LABEL[installation.status]}</Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Data / hora</dt>
                <dd>{formatAgendaDate(installation.scheduled_start)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Equipe</dt>
                <dd>{installation.team?.name ?? "Sem equipe definida"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Responsável</dt>
                <dd>
                  {installation.responsible?.name ||
                    installation.responsible?.email ||
                    "Responsável não definido"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Veículo</dt>
                <dd>{installation.vehicle_label || "Não definido"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Endereço</dt>
                <dd>{address || "Endereço não informado"}</dd>
              </div>
              {installation.completion_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Observações finais</dt>
                  <dd className="whitespace-pre-wrap">
                    {installation.completion_notes}
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Observações</dt>
                <dd>{installation.notes || "Sem observações"}</dd>
              </div>
              {installation.started_at && (
                <div>
                  <dt className="text-muted-foreground">Iniciada em</dt>
                  <dd>{formatAgendaDate(installation.started_at)}</dd>
                </div>
              )}
              {installation.completed_at && (
                <div>
                  <dt className="text-muted-foreground">Concluída em</dt>
                  <dd>{formatAgendaDate(installation.completed_at)}</dd>
                </div>
              )}
              {installation.cancelled_at && (
                <div>
                  <dt className="text-muted-foreground">Cancelada em</dt>
                  <dd>{formatAgendaDate(installation.cancelled_at)}</dd>
                </div>
              )}
              {installation.status === "CANCELLED" && (
                <div>
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd>{installation.cancelled_reason || "Não informado"}</dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir endereço no Google Maps"
                  href={buildMapsUrl({
                    address,
                    lat: installation.address_lat,
                    lng: installation.address_lng,
                  })}
                >
                  Google Maps
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Abrir endereço no Waze"
                  href={buildWazeUrl({
                    address,
                    lat: installation.address_lat,
                    lng: installation.address_lng,
                  })}
                >
                  Waze
                </a>
              </Button>
            </div>
            {fieldView === "loading" && (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                Carregando checklist e evidências da instalação…
              </p>
            )}
            {fieldView === "ready" && fieldData.checklist.length === 0 && fieldData.evidence.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum checklist ou evidência cadastrado nesta instalação.
              </p>
            )}
            {fieldView === "ready" && fieldData.checklist.length > 0 && (
              <section className="grid gap-5 border-t pt-4 md:grid-cols-2">
                <InstallationChecklist
                  title="Checklist pré-instalação"
                  items={fieldData.checklist.filter(
                    item => item.phase === "PRE_START"
                  )}
                  readOnly
                />
                <InstallationChecklist
                  title="Checklist final"
                  items={fieldData.checklist.filter(
                    item => item.phase === "COMPLETION"
                  )}
                  readOnly
                />
              </section>
            )}
            {fieldView === "ready" && fieldData.evidence.length > 0 && (
              <section className="border-t pt-4">
                <h3 className="mb-3 font-medium">Galeria de evidências</h3>
                <InstallationEvidenceGallery evidence={fieldData.evidence} />
              </section>
            )}
            {previousInstallations.length > 0 && (
              <section className="border-t pt-3">
                <h3 className="mb-2 font-medium">Histórico de instalações</h3>
                <div className="space-y-2">
                  {previousInstallations.map(row => (
                    <div key={row.id} className="rounded-md border p-3 text-sm">
                      <Badge variant="secondary">
                        {INSTALLATION_STATUS_LABEL[row.status]}
                      </Badge>
                      <span className="ml-2">
                        {formatAgendaDate(
                          row.completed_at ||
                            row.cancelled_at ||
                            row.scheduled_start
                        )}
                      </span>
                      {row.cancelled_reason && (
                        <p className="mt-1 text-muted-foreground">
                          Motivo: {row.cancelled_reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : order.logistic_type === "instalacao" ? (
          <p>
            Aguardando agendamento.{" "}
            <Link href="/instalacoes" className="text-primary underline">
              Abrir Instalações
            </Link>
          </p>
        ) : null}
        {delivery ? (
          <OrderDeliverySummary delivery={delivery} />
        ) : order.logistic_type === "entrega" ? (
          <p>
            Aguardando agendamento.{" "}
            <Link href="/entregas" className="text-primary underline">
              Abrir Entregas
            </Link>
          </p>
        ) : null}
        {order.logistic_type === "retirada" && (
          <OrderPickupSummary pickup={pickup} />
        )}
        {fieldView === "error" && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
            <p className="min-w-0 text-sm text-destructive">Não foi possível carregar o checklist e as evidências da instalação.</p>
            <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setExecutionReloadKey(key => key + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
