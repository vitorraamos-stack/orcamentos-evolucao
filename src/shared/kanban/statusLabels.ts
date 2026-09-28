import type { ArtStatus, ProdStatus } from "@/features/hubos/types";

/** Presentation language for the operational boards; database values stay canonical. */
export const ART_STATUS_LABELS: Record<ArtStatus, string> = {
  "Caixa de Entrada": "Caixa de Entrada",
  "Fila de Arte": "Fila de Arte",
  "Em Criação": "Em Arte",
  "Para Aprovação": "Aguardando Aprovação",
  Ajustes: "Ajustes",
  Produzir: "Liberado para Produção",
};

export const PRODUCTION_STATUS_LABELS: Record<ProdStatus, string> = {
  Produção: "Em Produção",
  "Em Acabamento": "Acabamento / Conferência",
  "Pronto / Avisar Cliente": "Material Pronto",
  "Logística (Entrega/Transportadora)": "Logística (Entrega/Transportadora)",
  "Instalação Agendada": "Instalação Agendada",
  Finalizados: "Finalizados",
};

export function getOperationalStatusLabel(status: ArtStatus | ProdStatus) {
  return ART_STATUS_LABELS[status as ArtStatus] ?? PRODUCTION_STATUS_LABELS[status as ProdStatus] ?? status;
}
