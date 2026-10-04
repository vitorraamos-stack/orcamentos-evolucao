import { supabase } from "@/lib/supabase";
import type {
  Product,
  ProductVersion,
  ProductVersionDefinition,
  ProductEngineeringMutation,
} from "@shared/product-engineering";

async function token() {
  let { data } = await supabase.auth.getSession();
  if (!data.session) data = (await supabase.auth.refreshSession()).data;
  if (!data.session) throw new Error("Sessão expirada. Faça login novamente.");
  return data.session.access_token;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/product-engineering${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await token()}`,
      ...init?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(
      result?.error?.message ?? "Product Engineering request failed"
    ) as Error & { code?: string; issues?: unknown[] };
    error.code = result?.error?.code;
    error.issues = result?.error?.issues;
    throw error;
  }
  return result.data;
}
const mutate = <T>(command: ProductEngineeringMutation) =>
  request<T>("", { method: "POST", body: JSON.stringify(command) });
export const productEngineeringRepository = {
  listProducts: () => request<Product[]>(""),
  listProductVersions: (productId: string) =>
    request<ProductVersion[]>(`?productId=${encodeURIComponent(productId)}`),
  loadProductVersionDefinition: (versionId: string) =>
    request<ProductVersionDefinition>(
      `?versionId=${encodeURIComponent(versionId)}`
    ),
  createProduct: (
    product: Extract<
      ProductEngineeringMutation,
      { action: "CREATE_PRODUCT" }
    >["product"]
  ) => mutate({ action: "CREATE_PRODUCT", product }),
  saveProductVersionDraft: (
    payload: Omit<
      Extract<ProductEngineeringMutation, { action: "SAVE_DRAFT" }>,
      "action"
    >
  ) => mutate({ action: "SAVE_DRAFT", ...payload }),
  startProductVersionValidation: (
    versionId: string,
    expectedRevision: number
  ) => mutate({ action: "START_VALIDATION", versionId, expectedRevision }),
  returnProductVersionToDraft: (versionId: string, expectedRevision: number) =>
    mutate({ action: "RETURN_TO_DRAFT", versionId, expectedRevision }),
  publishProductVersion: (versionId: string, expectedRevision: number) =>
    mutate({ action: "PUBLISH_VERSION", versionId, expectedRevision }),
};
