export type KioskBoardStage =
  | "acabamento_entrega_retirada"
  | "acabamento_instalacao"
  | "embalagem"
  | "instalacoes"
  | "pronto_avisar"
  | "logistica";

export type KioskSourceType = "os" | "os_orders";

export type KioskMoveAction =
  | "to_packaging"
  | "to_installations"
  | "to_ready_notify"
  | "to_logistics";

export type KioskBoardCard = {
  id: string;
  order_key: string;
  source_type: KioskSourceType;
  source_id: string;
  os_number: number | null;
  sale_number: string | null;
  client_name: string | null;
  title: string | null;
  description: string | null;
  address: string | null;
  delivery_date: string | null;
  delivery_mode: string | null;
  production_tag: string | null;
  upstream_status: string | null;
  current_stage: KioskBoardStage;
  material_ready: boolean;
  terminal_id: string | null;
  last_lookup_code: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KioskBoardMoveResult = {
  removed: boolean;
  result_code: string;
  result_message: string;
} & KioskBoardCard;

export type KioskOrphanCleanupResult = {
  order_key: string;
  removed: boolean;
  reason: string;
};

export type KioskHealthState =
  | "healthy"
  | "syncing"
  | "degraded"
  | "offline"
  | "auth_error";

export type KioskErrorKind =
  | "auth"
  | "network"
  | "backend_drift"
  | "unknown";
