import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Installation } from "../types";
import {
  formatAgendaDate,
  installationEventDate,
  installationOrderLabel,
  INSTALLATION_STATUS_LABEL,
} from "../services/installations";

export function InstallationHistoryCard({
  installation,
}: {
  installation: Installation;
}) {
  const label = installationOrderLabel(installation);
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            href={`/os/${installation.os_id}`}
            className="font-semibold text-primary hover:underline"
          >
            OS {label.number} · {label.client}
          </Link>
          <Badge
            variant={
              installation.status === "CANCELLED" ? "secondary" : "default"
            }
          >
            {INSTALLATION_STATUS_LABEL[installation.status]}
          </Badge>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{formatAgendaDate(installationEventDate(installation))}</p>
          <p>{installation.team?.name ?? "Sem equipe definida"}</p>
          {installation.responsible && (
            <p>
              Responsável:{" "}
              {installation.responsible.name ||
                installation.responsible.email ||
                "Responsável não definido"}
            </p>
          )}
          {installation.vehicle_label && (
            <p>Veículo: {installation.vehicle_label}</p>
          )}
          {installation.status === "CANCELLED" &&
            installation.cancelled_reason && (
              <p>Motivo: {installation.cancelled_reason}</p>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
