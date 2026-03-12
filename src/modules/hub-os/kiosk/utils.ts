import { KIOSK_STAGE_LABELS, KIOSK_TERMINAL_ID_KEY } from "./constants";
import type {
  KioskBoardCard,
  KioskBoardMoveResult,
  KioskBoardStage,
  KioskMoveAction,
} from "./types";

const DUPLICATE_DB_CODE = "23505";

const randomTerminalId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getStageLabel = (stage: KioskBoardStage) => KIOSK_STAGE_LABELS[stage];

export const getOrCreateTerminalId = () => {
  const existing = localStorage.getItem(KIOSK_TERMINAL_ID_KEY);
  if (existing) return existing;

  const next = randomTerminalId();
  localStorage.setItem(KIOSK_TERMINAL_ID_KEY, next);
  return next;
};

export const parseKioskError = (error: unknown) => {
  const candidate = error as {
    message?: string;
    code?: string;
    details?: string;
  };

  const normalized = String(candidate?.message ?? "").toLowerCase();
  const details = String(candidate?.details ?? "");

  if (candidate?.code === DUPLICATE_DB_CODE || details.includes("KIOSK_DUPLICATE")) {
    return "Essa OS já está no quiosque.";
  }
  if (details.includes("KIOSK_UPSTREAM_NOT_FOUND") || normalized.includes("não encontrada")) {
    return "OS não encontrada na base. Verifique a etiqueta e tente novamente.";
  }
  if (details.includes("KIOSK_UPSTREAM_FINALIZED")) {
    return "Essa OS já está finalizada e não pode entrar no quiosque.";
  }
  if (details.includes("KIOSK_NOT_FINALIZED")) {
    return "A OS ainda não está finalizada e não pode ser removida.";
  }
  if (details.includes("KIOSK_INVALID_ACTION")) {
    return "Ação inválida para este card no quiosque.";
  }
  if (normalized.includes("jwt") || normalized.includes("permission") || normalized.includes("permiss")) {
    return "Você não tem permissão para executar esta ação no quiosque.";
  }
  if (error instanceof TypeError || normalized.includes("network") || normalized.includes("fetch")) {
    return "Falha de rede ao sincronizar o quiosque. Tentaremos novamente no próximo ciclo.";
  }

  return candidate?.message || "Falha inesperada ao sincronizar o quiosque.";
};

export const upsertCard = (cards: KioskBoardCard[], nextCard: KioskBoardCard) => {
  const existing = cards.find(card => card.order_key === nextCard.order_key);
  if (!existing) return [nextCard, ...cards];
  return cards.map(card => (card.order_key === nextCard.order_key ? nextCard : card));
};

export const applyMoveResult = (
  cards: KioskBoardCard[],
  moveResult: KioskBoardMoveResult
) => {
  if (moveResult.removed) {
    return cards.filter(card => card.order_key !== moveResult.order_key);
  }
  return upsertCard(cards, moveResult);
};

export const resolveMoveAction = (params: {
  stage: KioskBoardStage;
  deliveryMode: string | null;
}): KioskMoveAction | null => {
  const deliveryMode = (params.deliveryMode ?? "").toLowerCase();

  if (params.stage === "acabamento_entrega_retirada") return "to_packaging";
  if (params.stage === "acabamento_instalacao") return "to_installations";
  if (params.stage !== "embalagem") return null;

  if (deliveryMode.includes("retirada")) return "to_ready_notify";
  if (deliveryMode.includes("entrega")) return "to_logistics";
  return null;
};
