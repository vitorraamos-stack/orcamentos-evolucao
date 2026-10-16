export type LibraryFieldType = "text" | "number" | "dimensions" | "select" | "multi" | "yesno" | "attachment";
export type LibraryVisibility = "consultor" | "internal";

export type LibraryField = {
  id: string;
  label: string;
  type: LibraryFieldType;
  required: boolean;
  when: "always" | "paint" | "install" | "noart";
  options?: string[];
  help?: string;
  unit?: string;
  visibility?: LibraryVisibility;
};

export type LibraryPhoto = {
  id: string;
  title: string;
  url: string;
  kind: "application" | "detail" | "render" | "process";
  caption: string;
  visibility: LibraryVisibility;
  cover?: boolean;
};

export type LibraryComplement = {
  id: string;
  name: string;
  mode: "separate" | "included" | "internal";
  visibility: "commercial" | "internal";
  when: "always" | "install" | "noart";
};

export type LibraryConditionalRule = {
  id: string;
  field: string;
  equals: string;
  action: "note" | "require_photos" | "technical_review";
  message: string;
};

export type LibraryRules = {
  photos_policy?: "recommend" | "required" | "waive";
  waiver_reason?: string;
  conditions?: LibraryConditionalRule[];
};

export type LibraryTemplate = {
  id: string;
  name: string;
  category: string;
  fields: LibraryField[];
  version: number;
  updated_at: string;
};

export type LibraryComplementTemplate = LibraryComplement & {
  version: number;
  updated_at: string;
};

export type LibraryDraft = {
  name: string;
  category: string;
  description: string;
  applications: string;
  fields: LibraryField[];
  gallery: LibraryPhoto[];
  complements: LibraryComplement[];
  consultant_guidance: string;
  internal_guidance: string;
  rules: LibraryRules;
  source_template?: { id: string; version: number };
};

export type LibraryPublication = Pick<LibraryDraft, "name" | "category" | "description" | "applications" | "fields"> & {
  gallery: Omit<LibraryPhoto, "visibility">[];
  complements: (Pick<LibraryComplement, "id" | "name" | "mode" | "when"> & {visibility?: LibraryComplement["visibility"]})[];
  guidance: string;
  rules?: { photos_policy: "recommend" | "required" | "waive"; special_fixing_review: true; conditions?: LibraryConditionalRule[] };
};

export type LibraryProductRecord = {
  id: string;
  draft: LibraryDraft;
  revision: number;
  status: "draft" | "published" | "archived";
  published_version: number;
  published_revision: number;
  updated_at: string;
};

export type LibraryPublishedRecord = {
  product_id: string;
  version: number;
  content: LibraryPublication;
  published_at: string;
};

export const emptyLibraryDraft = (): LibraryDraft => ({
  name: "",
  category: "Letras e letreiros",
  description: "",
  applications: "",
  fields: [],
  gallery: [],
  complements: [],
  consultant_guidance: "",
  internal_guidance: "",
  rules: {photos_policy:"recommend"},
});

export const libraryCategories = [
  "Letras e letreiros",
  "Placas e fachadas",
  "Adesivos",
  "Impressão digital",
  "Promocionais",
] as const;

export function validateLibraryDraft(draft: LibraryDraft): string[] {
  const errors: string[] = [];
  if (draft.name.trim().length < 3) errors.push("Informe o nome do produto (mínimo de 3 caracteres).");
  if (!draft.category.trim()) errors.push("Selecione uma categoria.");
  if (draft.description.trim().length < 5) errors.push("Informe uma descrição (mínimo de 5 caracteres).");
  if (draft.fields.some(f => !f.id.trim() || !f.label.trim())) errors.push("Há campos incompletos.");
  if (new Set(draft.fields.map(f => f.id)).size !== draft.fields.length) errors.push("Há identificadores de campos repetidos.");
  if (draft.fields.some(f => f.type === "attachment" && f.required)) errors.push("Anexos obrigatórios ainda não estão disponíveis nesta etapa.");
  if (draft.fields.some(f => ["select","multi"].includes(f.type) && (!Array.isArray(f.options) || f.options.length === 0))) {
    errors.push("Campos de seleção precisam de opções.");
  }
  if (draft.gallery.some(photo => photo.visibility === "consultor" &&
    !(/^https:\/\//i.test(photo.url) || /^storage:\/\/library-product-images\/[0-9a-f-]{36}\/[a-z0-9_.-]+$/i.test(photo.url)))) {
    errors.push("Imagens comerciais precisam de URL HTTPS ou arquivo armazenado.");
  }
  if ((draft.rules?.photos_policy || "recommend")==="waive" && (draft.rules?.waiver_reason||"").trim().length<10) {
    errors.push("Explique a dispensa das fotografias (mínimo 10 caracteres).");
  }
  for (const rule of draft.rules?.conditions||[]) {
    const source=draft.fields.find(f=>f.id===rule.field && f.visibility!=="internal");
    if (!source || !["select","yesno"].includes(source.type)) errors.push("Regra com campo controlador inexistente ou inválido.");
    else if (!(source.type==="yesno"?["Sim","Não"].includes(rule.equals):(source.options||[]).includes(rule.equals))) {
      errors.push("Regra com opção de comparação inválida.");
    }
    if (rule.action==="note" && !rule.message.trim()) errors.push("Informe a orientação da regra.");
  }
  if (draft.fields.some(f=>f.when!=="always" && !draft.fields.some(x=>x.id===({paint:"acabamento",install:"instalacao",noart:"arte_vetorial"} as Record<string,string>)[f.when]))) {
    errors.push("Existem campos condicionais sem o campo controlador.");
  }
  return errors;
}

export function libraryFieldVisible(field: LibraryField, values: Record<string, unknown>): boolean {
  if (field.when === "paint") return String(values.acabamento || "").toLowerCase().includes("pintura");
  if (field.when === "install") return values.instalacao === "Sim";
  if (field.when === "noart") return values.arte_vetorial === "Não";
  return true;
}

export function libraryMissingFields(fields: LibraryField[], values: Record<string, unknown>): string[] {
  return fields.filter(field => {
    if (!field.required || !libraryFieldVisible(field, values)) return false;
    const value = values[field.id];
    if (field.type === "dimensions") {
      const dims = value as { width?: string; height?: string } | undefined;
      return !(Number(dims?.width) > 0 && Number(dims?.height) > 0);
    }
    if (field.type === "multi") return !Array.isArray(value) || !value.length;
    if (field.type === "attachment") return value !== true;
    if (field.type === "yesno") return value !== "Sim" && value !== "Não";
    if (field.type === "select") return !field.options?.includes(String(value ?? ""));
    if (field.type === "number") return value === "" || value == null || !Number.isFinite(Number(value)) || Number(value) <= 0;
    return String(value ?? "").trim().length === 0;
  }).map(field => field.label);
}
