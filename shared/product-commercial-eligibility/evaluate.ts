import type { PublishedCommercialAdapterResult } from "../product-commercial-adapter/index.js";
import {
  commercialEligibilityResultSchema,
  type CommercialEligibilityRequest,
  type CommercialEligibilityResult,
} from "./index.js";

type Input = {
  key: string;
  type: string;
  unit?: string | null;
  required?: boolean;
  defaultValue?: string;
  min?: string;
  max?: string;
  options?: Array<{ value: string; label: string }>;
};

export type CommercialEligibilityTechnicalContext = {
  code: string;
  engineeringInputs: readonly Input[];
  serverManagedKeys: ReadonlySet<string>;
  pricingAvailable: boolean;
};

const knownPvcFields = new Set([
  "medidas", "quantidade", "espessura", "acabamento", "cor",
  "arte_vetorial", "instalacao", "superficie", "fixacao_especial",
]);
const lengthUnits = new Set(["mm", "cm", "m"]);
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const positive = (value: unknown) => {
  const n = typeof value === "string" && value.trim() === ""
    ? Number.NaN : Number(value);
  return Number.isFinite(n) && n > 0;
};
const isFilled = (value: unknown) =>
  value !== undefined && value !== null && value !== "";
function fieldVisible(when: string, values: Record<string, unknown>) {
  if (when === "paint") return text(values.acabamento).toLowerCase().includes("pintura");
  if (when === "install") return values.instalacao === "Sim";
  if (when === "noart") return values.arte_vetorial === "Não";
  return when === "always";
}
function dimension(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return positive(v.width) && positive(v.height);
}
function fieldFilled(type: string, value: unknown) {
  if (type === "dimensions") return dimension(value);
  if (type === "number") return positive(value);
  if (type === "yesno") return value === "Sim" || value === "Não";
  if (type === "multi") return Array.isArray(value) && value.length > 0;
  if (type === "attachment") return value === true;
  return text(value).length > 0;
}
function fieldInvalid(
  field: PublishedCommercialAdapterResult["fields"][number],
  value: unknown,
): boolean {
  if (!isFilled(value)) return false;
  if (field.type === "dimensions") return !dimension(value);
  if (field.type === "number") return !positive(value);
  if (field.type === "select")
    return !field.options?.includes(text(value));
  if (field.type === "yesno")
    return value !== "Sim" && value !== "Não";
  if (field.type === "multi")
    return !Array.isArray(value) ||
      value.some(v => typeof v !== "string" || !field.options?.includes(v));
  if (field.type === "attachment") return value !== true;
  return typeof value !== "string";
}
function rangeValid(input: Input, value: number) {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (input.min !== undefined && value < Number(input.min)) return false;
  if (input.max !== undefined && value > Number(input.max)) return false;
  return true;
}
function technicalMappingIsValid(
  publication: PublishedCommercialAdapterResult,
  values: Record<string, unknown>,
  context: CommercialEligibilityTechnicalContext,
) {
  if (context.code !== "LETREIRO_PVC") return false;
  if (publication.fields.some(field => !knownPvcFields.has(field.id))) return false;
  if (text(values.acabamento) !== "PVC natural branco") return false;
  if (values.instalacao !== "Não" || values.arte_vetorial !== "Sim") return false;
  const dims = values.medidas as Record<string, unknown>;
  const quantity = Number(values.quantidade);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return false;
  const commercialUnit = publication.fields.find(f => f.id === "medidas")?.unit;
  const factor = commercialUnit === "cm" ? 0.01 : commercialUnit === "mm" ? 0.001
    : commercialUnit === "m" ? 1 : null;
  if (factor === null) return false;
  const inputs = new Map(context.engineeringInputs.map(i => [i.key, i]));
  const width = inputs.get("width"), height = inputs.get("height");
  const thickness = inputs.get("thickness"), colors = inputs.get("number_of_colors");
  if (!width || !height || !thickness || !colors) return false;
  if (width.type !== "DECIMAL" || height.type !== "DECIMAL" ||
      width.unit !== "m" || height.unit !== "m" ||
      thickness.type !== "SELECT" ||
      colors.type !== "DECIMAL" || colors.defaultValue !== "0") return false;
  if (!rangeValid(width, Number(dims.width) * factor) ||
      !rangeValid(height, Number(dims.height) * factor)) return false;
  if (!thickness.options?.some(option => option.label === text(values.espessura)))
    return false;
  // Unmapped mandatory inputs must be authoritative server parameters.
  for (const input of context.engineeringInputs) {
    if (["width", "height", "thickness", "number_of_colors"].includes(input.key))
      continue;
    if (input.required && !context.serverManagedKeys.has(input.key)) return false;
  }
  return true;
}

export function assessCommercialEligibility(
  publication: PublishedCommercialAdapterResult,
  request: CommercialEligibilityRequest,
  context: CommercialEligibilityTechnicalContext | null,
): CommercialEligibilityResult {
  const { values, selectedComplementIds } = request;
  const missing: string[] = [];
  const invalid: string[] = [];
  const notes: string[] = [];
  const reasons: CommercialEligibilityResult["reasons"] = [];
  const addReason = (reason: CommercialEligibilityResult["reasons"][number]) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  const visible = publication.fields.filter(field => fieldVisible(field.when, values));
  for (const field of visible) {
    const value = values[field.id];
    if (field.required && !fieldFilled(field.type, value)) {
      // Malformed values count as invalid, not just absent input.
      if (!isFilled(value)) missing.push(field.label);
      else invalid.push(field.id);
    } else if (fieldInvalid(field, value)) invalid.push(field.id);
  }
  if (visible.some(field => field.id === "quantidade") &&
      fieldFilled("number", values.quantidade) &&
      !Number.isSafeInteger(Number(values.quantidade)))
    invalid.push("quantidade");

  const conditions = (publication.rules.conditions ?? [])
    .filter(rule => text(values[rule.field]) === rule.equals);
  const photoRequired =
    (publication.rules.photos_policy === "required" && values.instalacao === "Sim")
    || conditions.some(rule => rule.action === "require_photos");
  if (photoRequired && !request.photosConfirmed)
    missing.push("Confirmar recebimento das fotografias do local");

  const validComplements = new Map(
    publication.complements
      .filter(c => fieldVisible(c.when, values))
      .map(c => [c.id, c]),
  );
  if (new Set(selectedComplementIds).size !== selectedComplementIds.length ||
      selectedComplementIds.some(id => !validComplements.has(id)))
    addReason("INVALID_COMPLEMENT");

  if (missing.length) addReason("MISSING_FIELDS");
  if (invalid.length) addReason("INVALID_VALUES");
  if (conditions.some(rule => rule.action === "technical_review")) {
    notes.push(...conditions.filter(rule => rule.action === "technical_review")
      .map(rule => rule.message || "Avaliação técnica necessária"));
    addReason("TECHNICAL_REVIEW_REQUIRED");
  }
  if (values.instalacao === "Sim" && values.fixacao_especial === "Sim") {
    notes.push("Fixação especial depende de análise técnica");
    addReason("SPECIAL_FIXING_REVIEW");
  }
  if (values.instalacao === "Sim" && values.superficie === "Outra / avaliar") {
    notes.push("Superfície precisa de avaliação técnica");
    addReason("TECHNICAL_REVIEW_REQUIRED");
  }

  let status: CommercialEligibilityResult["status"];
  if (missing.length) status = "INCOMPLETE";
  else if (invalid.length || reasons.includes("INVALID_COMPLEMENT"))
    status = "INVALID_COMBINATION";
  else if (notes.length) status = "TECHNICAL_PENDING";
  else if (request.commercialVersion !== publication.commercialVersion) {
    status = "PREPARATION_ONLY";
    addReason("VERSION_REVIEW_REQUIRED");
  } else if (!publication.engineeringVersion) {
    status = "PREPARATION_ONLY";
    addReason("ENGINEERING_UNAVAILABLE");
  } else if (selectedComplementIds.length > 0 ||
      !context || !technicalMappingIsValid(publication, values, context)) {
    status = "PREPARATION_ONLY";
    addReason("UNSUPPORTED_MAPPING");
  } else if (!context.pricingAvailable) {
    status = "PREPARATION_ONLY";
    addReason("PRICING_UNAVAILABLE");
  } else {
    status = "CALCULABLE";
  }
  // "CALCULABLE" means eligible to invoke the authoritative calculator;
  // it does NOT mean a price, cost rate or final transfer is approved.
  return commercialEligibilityResultSchema.parse({
    productId: publication.productId,
    libraryProductId: publication.libraryProductId,
    commercialVersion: publication.commercialVersion,
    engineeringVersion: publication.engineeringVersion,
    status, reasons, missing, technicalNotes: notes,
    canAttemptCalculation: status === "CALCULABLE",
    canTransfer: false,
  });
}
