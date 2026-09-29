import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import {
  DELIVERY_MODE_LABEL,
  DELIVERY_STATUS_LABEL,
  pickupState,
} from "@/modules/deliveries/services/deliveries";
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
  useEffect(() => {
    let alive = true;
    void (async () => {
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
      const { data } = await query;
      if (alive) setRecord(data as typeof record);
    })();
    return () => {
      alive = false;
    };
  }, [order.id, order.logistic_type]);
  const installation =
    order.logistic_type === "instalacao"
      ? (record as Installation | null)
      : null;
  const delivery =
    order.logistic_type === "entrega" ? (record as Delivery | null) : null;
  const pickup =
    order.logistic_type === "retirada"
      ? (record as HubOrderFlowRow | null)
      : null;
  const address = installation?.address_snapshot || order.address;
  const previousInstallations = installationHistory.filter(
    row => row.id !== installation?.id
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Instalação / Entrega</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {installation ? (
          <>
            <div>
              <span className="text-sm text-muted-foreground">Status: </span>
              <Badge>{INSTALLATION_STATUS_LABEL[installation.status]}</Badge>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
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
              <Button asChild size="sm" variant="outline">
                <a
                  target="_blank"
                  href={buildMapsUrl({
                    address,
                    lat: installation.address_lat,
                    lng: installation.address_lng,
                  })}
                >
                  Maps
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a
                  target="_blank"
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
          <>
            <Badge>{DELIVERY_STATUS_LABEL[delivery.status]}</Badge>
            <p>
              {DELIVERY_MODE_LABEL[delivery.mode]} ·{" "}
              {delivery.scheduled_at
                ? formatAgendaDate(delivery.scheduled_at)
                : "Sem horário"}
            </p>
            <p>
              {delivery.carrier_name ||
                delivery.vehicle_label ||
                "Responsável não informado"}{" "}
              · Rastreio: {delivery.tracking_code || "—"}
            </p>
          </>
        ) : order.logistic_type === "entrega" ? (
          <p>
            Aguardando agendamento.{" "}
            <Link href="/entregas" className="text-primary underline">
              Abrir Entregas
            </Link>
          </p>
        ) : null}
        {order.logistic_type === "retirada" && (
          <>
            <Badge>{pickupState(pickup ?? undefined)}</Badge>
            <p>
              Aviso:{" "}
              {pickup?.avisado_at
                ? formatAgendaDate(pickup.avisado_at)
                : "pendente"}
            </p>
            <p>
              Retirada:{" "}
              {pickup?.retirado_at
                ? formatAgendaDate(pickup.retirado_at)
                : "pendente"}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
