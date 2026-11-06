import { supabase } from "@/lib/supabase";
import type { OperationDependency } from "./dashboardAdvanced";

function raise(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function createDashboardDependency(input: {
  orderId: string;
  predecessorId: string;
  successorId: string;
  reason: string;
}): Promise<OperationDependency> {
  const { data, error } = await supabase.rpc("dashboard_link_operations", {
    p_order_id: input.orderId,
    p_predecessor_id: input.predecessorId,
    p_successor_id: input.successorId,
    p_reason: input.reason,
  });
  raise(error, "Não foi possível registrar a dependência.");
  if (!data || typeof data !== "object")
    throw new Error("O banco não confirmou o vínculo criado.");
  return data as OperationDependency;
}

export async function removeDashboardDependency(input: {
  dependencyId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc("dashboard_unlink_operations", {
    p_dependency_id: input.dependencyId,
    p_reason: input.reason,
  });
  raise(error, "Não foi possível remover a dependência.");
}
