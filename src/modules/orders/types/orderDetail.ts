import type { OsOrder, OsOrderLayoutAsset } from "@/features/hubos/types";

export type OperationalStage =
  | "ENTRY"
  | "ART"
  | "APPROVAL"
  | "PRODUCTION"
  | "FINISHING"
  | "READY"
  | "LOGISTICS"
  | "FINISHED";

export type AssigneeScope =
  | "GENERAL"
  | "ART"
  | "PRODUCTION"
  | "FINISHING"
  | "INSTALLATION";
export type DeadlineScope = Exclude<AssigneeScope, "GENERAL"> | "APPROVAL";
export type OrderItemStatus = "PENDING" | "IN_PROGRESS" | "READY" | "CANCELLED";

export type UserOption = { id: string; name: string; email: string | null };
export type OrderAssignee = {
  id: string;
  order_id: string;
  user_id: string;
  scope: AssigneeScope;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  user?: UserOption;
};
export type OrderDeadline = {
  id: string;
  order_id: string;
  scope: DeadlineScope;
  due_date: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type OrderItem = {
  id: string;
  order_id: string;
  name: string;
  description: string | null;
  quantity: number;
  width_cm: number | null;
  height_cm: number | null;
  unit: string;
  notes: string | null;
  status: OrderItemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
};
export type OrderComment = {
  id: string;
  order_id: string;
  user_id: string;
  message: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  user?: UserOption;
};
export type OrderActivity = {
  id: string;
  os_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  actor?: UserOption;
};
export type OrderDetail = {
  order: OsOrder;
  assignees: OrderAssignee[];
  deadlines: OrderDeadline[];
};
export type OrderFilesData = { assets: OsOrderLayoutAsset[] };

