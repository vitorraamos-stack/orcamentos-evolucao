import type { ArtStatus, OsOrder, ProdStatus } from "@/features/hubos/types";
import type { HubRole } from "@/lib/hubRoles";
import type { OperationalStage } from "../types/orderDetail";

const normalize = (value?: string | null) =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function getOrderOperationalStage(
  order: Pick<OsOrder, "art_status" | "prod_status" | "archived">
): OperationalStage {
  const prod = normalize(order.prod_status);
  const art = normalize(order.art_status);
  if (order.archived || prod.includes("finaliz")) return "FINISHED";
  if (prod.includes("instal") || prod.includes("logistic")) return "LOGISTICS";
  if (prod.includes("pronto") || prod.includes("avisar")) return "READY";
  if (prod.includes("acabamento") || prod.includes("qualidade")) return "FINISHING";
  if (prod || art === "produzir") return "PRODUCTION";
  if (art.includes("aprov") || art === "ajustes") return "APPROVAL";
  if (art.includes("criacao") || art.includes("andamento")) return "ART";
  return "ENTRY";
}

const ART_TRANSITIONS: Record<string, string[]> = {
  "Caixa de Entrada": ["Em Criação"],
  "Em Criação": ["Para Aprovação"],
  "Para Aprovação": ["Ajustes", "Produzir"],
  Ajustes: ["Em Criação", "Para Aprovação"],
  Produzir: [],
};
const PROD_TRANSITIONS: Record<string, string[]> = {
  Produção: ["Em Acabamento"],
  "Em Acabamento": ["Pronto / Avisar Cliente"],
  "Pronto / Avisar Cliente": ["Logística (Entrega/Transportadora)", "Instalação Agendada", "Finalizados"],
  "Logística (Entrega/Transportadora)": ["Instalação Agendada", "Finalizados"],
  "Instalação Agendada": ["Finalizados"],
  Finalizados: [],
};

type TransitionContext = { role: HubRole | null; isManager?: boolean };
const canOperate = (context: TransitionContext, board: "art" | "production") =>
  context.isManager || context.role === (board === "art" ? "arte_finalista" : "producao");

export const canTransitionArtStatus = (
  from: ArtStatus,
  to: ArtStatus,
  context: TransitionContext
) => canOperate(context, "art") && (ART_TRANSITIONS[from] ?? []).includes(to);

export const canTransitionProductionStatus = (
  from: ProdStatus,
  to: ProdStatus,
  context: TransitionContext
) => canOperate(context, "production") && (PROD_TRANSITIONS[from] ?? []).includes(to);

export function canTransitionOrderStatus(input: TransitionContext & {
  board: "art" | "production";
  from: ArtStatus | ProdStatus;
  to: ArtStatus | ProdStatus;
}) {
  return input.board === "art"
    ? canTransitionArtStatus(input.from as ArtStatus, input.to as ArtStatus, input)
    : canTransitionProductionStatus(input.from as ProdStatus, input.to as ProdStatus, input);
}

