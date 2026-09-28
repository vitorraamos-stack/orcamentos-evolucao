import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";
import {
  INSTALLATION_STATUS_LABEL,
  formatAgendaDate,
} from "@/modules/installations/services/installations";
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
  useEffect(() => {
    let alive = true;
    void (async () => {
      const query =
        order.logistic_type === "instalacao"
          ? supabase
              .from("os_installations")
              .select("*")
              .eq("os_id", order.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : order.logistic_type === "entrega"
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Instalação / Entrega</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {installation ? (
          <>
            <Badge>{INSTALLATION_STATUS_LABEL[installation.status]}</Badge>
            <p>{formatAgendaDate(installation.scheduled_start)}</p>
            <p>
              {installation.vehicle_label ?? "Sem veículo"} ·{" "}
              {installation.address_snapshot || "Sem endereço"}
            </p>
            <p className="text-sm text-muted-foreground">
              {installation.notes || "Sem observações"}
            </p>
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
