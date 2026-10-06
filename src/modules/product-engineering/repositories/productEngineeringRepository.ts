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
  createNewProductVersion: (
    sourceVersionId: string,
    expectedRevision: number
  ) => mutate({ action: "CREATE_VERSION", sourceVersionId, expectedRevision }),
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
  publishConfigurationInputDefault: async (
    sourceDefinition: ProductVersionDefinition,
    inputKey: string,
    defaultValue: string | boolean
  ) => {
    if (sourceDefinition.version.status !== "PUBLISHED")
      throw new Error("Somente uma versão publicada pode originar a alteração.");

    const sourceInput = sourceDefinition.inputs.find(
      input => input.key === inputKey
    );
    if (!sourceInput || sourceInput.scope !== "CONFIGURATION")
      throw new Error("Parâmetro de configuração não encontrado.");

    const created = await productEngineeringRepository.createNewProductVersion(
      sourceDefinition.version.id,
      sourceDefinition.version.revision
    );
    const draft =
      await productEngineeringRepository.loadProductVersionDefinition(
        created.versionId
      );

    const draftInput = draft.inputs.find(input => input.key === inputKey);
    if (!draftInput || draftInput.scope !== "CONFIGURATION")
      throw new Error("Parâmetro de configuração não foi clonado corretamente.");

    const inputs = draft.inputs.map(input =>
      input.key === inputKey
        ? ({ ...input, defaultValue } as typeof input)
        : input
    );

    const saved = await productEngineeringRepository.saveProductVersionDraft({
      versionId: draft.version.id,
      expectedRevision: draft.version.revision,
      notes: `Parâmetro ${sourceInput.label} atualizado pelo painel administrativo.`,
      inputs,
      variables: draft.variables,
      components: draft.components,
    });

    const validating =
      await productEngineeringRepository.startProductVersionValidation(
        draft.version.id,
        saved.revision
      );

    return productEngineeringRepository.publishProductVersion(
      draft.version.id,
      validating.version.revision
    );
  },
};
