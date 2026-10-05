import { supabase } from "@/lib/supabase";
import type { CostingMutation } from "@shared/costing/api";
import type { CostRate, CostTimestamp } from "@shared/costing/rates";
import type {
  CostResourceType,
  ResourceDefinition,
} from "@shared/costing/resources";

export type CostResourceRecord = {
  resource: ResourceDefinition;
  updatedAt: CostTimestamp;
};

async function accessToken() {
  let { data } = await supabase.auth.getSession();
  if (!data.session) data = (await supabase.auth.refreshSession()).data;
  if (!data.session) throw new Error("Sessão expirada. Faça login novamente.");
  return data.session.access_token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/costing${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
      ...init?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(
      result?.error?.message ?? "Costing request failed"
    ) as Error & { code?: string; issues?: unknown[] };
    error.code = result?.error?.code;
    error.issues = result?.error?.issues;
    throw error;
  }
  return result.data;
}

const mutate = <T>(command: CostingMutation) =>
  request<T>("", { method: "POST", body: JSON.stringify(command) });

export const costingRepository = {
  listCostResources: (type: CostResourceType) =>
    request<CostResourceRecord[]>(`?type=${encodeURIComponent(type)}`),
  loadCostResource: (type: CostResourceType, resourceId: string) =>
    request<CostResourceRecord & { rates: CostRate[] }>(
      `?type=${encodeURIComponent(type)}&resourceId=${encodeURIComponent(resourceId)}`
    ),
  createCostResource: (
    resource: Extract<
      CostingMutation,
      { action: "CREATE_RESOURCE" }
    >["resource"]
  ) => mutate<CostResourceRecord>({ action: "CREATE_RESOURCE", resource }),
  updateCostResource: (
    resource: ResourceDefinition,
    expectedUpdatedAt: CostTimestamp
  ) =>
    mutate<CostResourceRecord>({
      action: "UPDATE_RESOURCE",
      resource,
      expectedUpdatedAt,
    }),
  setCurrentCostRate: (
    payload: Omit<
      Extract<CostingMutation, { action: "SET_CURRENT_RATE" }>,
      "action"
    >
  ) =>
    mutate<{ rate: CostRate; closedRateId?: string }>({
      action: "SET_CURRENT_RATE",
      type: payload.type,
      resourceId: payload.resourceId,
      amount: payload.amount,
      effectiveFrom: payload.effectiveFrom,
    }),
};
