import type { KioskBoardStage, KioskMoveAction } from "./types";

export const KIOSK_BOARD_STAGES: KioskBoardStage[] = [
  "acabamento_entrega_retirada",
  "acabamento_instalacao",
  "embalagem",
  "instalacoes",
  "pronto_avisar",
  "logistica",
];

export const KIOSK_STAGE_LABELS: Record<KioskBoardStage, string> = {
  acabamento_entrega_retirada: "Acabamento • Entrega/Retirada",
  acabamento_instalacao: "Acabamento • Instalação",
  embalagem: "Embalagem",
  instalacoes: "Instalações",
  pronto_avisar: "Pronto/Avisar",
  logistica: "Logística",
};

export const KIOSK_TERMINAL_ID_KEY = "hubos:kiosk:terminal-id";

export const KIOSK_POLL_INTERVAL_MS = 15_000;
export const KIOSK_STALE_AFTER_MS = 45_000;
export const KIOSK_CRITICAL_STALE_AFTER_MS = 120_000;

export const KIOSK_ALLOWED_MOVE_ACTIONS: KioskMoveAction[] = [
  "to_packaging",
  "to_installations",
  "to_ready_notify",
  "to_logistics",
];

export const KIOSK_MOVE_LABELS: Record<KioskMoveAction, string> = {
  to_packaging: "Movido para Embalagem",
  to_installations: "Movido para Instalações",
  to_ready_notify: "Movido para Pronto/Avisar",
  to_logistics: "Movido para Logística",
};

export const KIOSK_MOVE_CTA_LABELS: Record<KioskMoveAction, string> = {
  to_packaging: "Pronto para embalar",
  to_installations: "Pronto para a Instalação",
  to_ready_notify: "Pronto para o Hub OS",
  to_logistics: "Pronto para a logística",
};
