import type { ArtStatus, OsOrder, ProdStatus } from "@/features/hubos/types";
import type { OrderRisk } from "@/modules/orders/risk";
import type { DeadlineScope } from "@/modules/orders/types/orderDetail";

export type BoardKind = "art" | "production";
export type BoardStatus = ArtStatus | ProdStatus;
export type BoardAssignee = {
  userId: string;
  name: string;
  email: string | null;
};
export type BoardDeadline = {
  scope: DeadlineScope;
  dueDate: string;
  completedAt: string | null;
};
export type BoardCardModel = {
  order: OsOrder;
  assignee: BoardAssignee | null;
  deadlines: BoardDeadline[];
  itemsTotal: number;
  itemsReady: number;
  commentsTotal: number;
  risk: OrderRisk;
};

export type BoardFiltersState = {
  search: string;
  mine: boolean;
  overdue: boolean;
  urgent: boolean;
  assigneeId: string;
  artTag: string;
  awaitingSupplies: boolean;
  external: boolean;
  reproducao: boolean;
  letraCaixa: boolean;
};

export const EMPTY_BOARD_FILTERS: BoardFiltersState = {
  search: "",
  mine: false,
  overdue: false,
  urgent: false,
  assigneeId: "all",
  artTag: "all",
  awaitingSupplies: false,
  external: false,
  reproducao: false,
  letraCaixa: false,
};
