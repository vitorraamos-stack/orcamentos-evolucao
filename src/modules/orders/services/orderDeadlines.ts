import { formatLocalDate } from "@/shared/lib/date";

export type DeadlineState = "NORMAL" | "TODAY" | "OVERDUE" | "COMPLETED";

export function getDeadlineState(
  deadline: { due_date: string; completed_at?: string | null },
  now = new Date()
): DeadlineState {
  if (deadline.completed_at) return "COMPLETED";
  const today = formatLocalDate(now);
  if (deadline.due_date < today) return "OVERDUE";
  if (deadline.due_date === today) return "TODAY";
  return "NORMAL";
}

