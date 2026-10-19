import { libraryFieldVisible, type LibraryField, type LibraryPublication } from "../model";

export type CommercialValues = Record<string, unknown>;
export type ConfigurationStatus = "incomplete" | "technical" | "ready";

export type CommercialAssessment = {
  status: ConfigurationStatus;
  missing: string[];
  technicalNotes: string[];
  information: string[];
  visibleFields: LibraryField[];
  availableComplements: LibraryPublication["complements"];
  descriptionLines: string[];
  photosRequired: boolean;
};

export type CommercialGroup = {
  key: "measurements" | "production" | "installation" | "art" | "other";
  title: string;
  fields: LibraryField[];
};

const groupConfig: { key: CommercialGroup["key"]; title: string; ids: string[] }[] = [
  { key: "measurements", title: "Medidas", ids: ["medidas", "quantidade"] },
  { key: "production", title: "Produção", ids: ["espessura", "acabamento", "cor", "material", "tipo_adesivo"] },
  { key: "installation", title: "Instalação", ids: ["instalacao", "superficie", "fixacao_especial"] },
  { key: "art", title: "Arte vetorial", ids: ["arte_vetorial"] },
];

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

export function commercialGroups(fields: LibraryField[]): CommercialGroup[] {
  const commercial = fields.filter((f) => f.visibility !== "internal");
  const assigned = new Set<string>();
  const groups: CommercialGroup[] = groupConfig.map((group) => {
    const values = commercial.filter((f) => group.ids.includes(f.id));
    values.forEach((f) => assigned.add(f.id));
    return { key: group.key, title: group.title, fields: values };
  }).filter((group) => group.fields.length > 0);
  const other = commercial.filter((f) => !assigned.has(f.id));
  if (other.length) groups.push({ key: "other", title: "Outras informações", fields: other });
  return groups;
}

export function applicableComplement(
  complement: LibraryPublication["complements"][number],
  values: CommercialValues,
): boolean {
  if (complement.mode === "internal" || complement.visibility === "internal") return false;
  if (complement.when === "install") return values.instalacao === "Sim";
  if (complement.when === "noart") return values.arte_vetorial === "Não";
  return true;
}

export function visibleCommercialFields(
  fields: LibraryField[], values: CommercialValues,
): LibraryField[] {
  return fields.filter((field) => field.visibility !== "internal" && libraryFieldVisible(field, values));
}

function formatValue(field: LibraryField, value: unknown): string {
  if (field.type === "dimensions") {
    if (!value || typeof value !== "object") return "";
    const d = value as Record<string, unknown>;
    const width = Number(d.width), height = Number(d.height);
    if (!(width > 0 && height > 0)) return "";
    return `${width} × ${height} ${field.unit || "cm"}`;
  }
  if (field.type === "multi") return Array.isArray(value) ? value.map(textValue).filter(Boolean).join(", ") : "";
  if (field.type === "attachment") return "";
  if (field.type === "number") {
    const num = Number(value);
    return textValue(value) && Number.isFinite(num) && num > 0 ? String(num) : "";
  }
  return textValue(value);
}

export function assessCommercialConfiguration(
  publication: LibraryPublication,
  values: CommercialValues,
  selectedComplementIds: string[],
  photosConfirmed: boolean,
): CommercialAssessment {
  const visibleFields = visibleCommercialFields(publication.fields || [], values);
  const missing = visibleFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.id];
      if (field.type === "attachment") return value !== true;
      if (field.type === "yesno") return value !== "Sim" && value !== "Não";
      if (field.type === "select") return !(field.options || []).includes(textValue(value));
      if (field.type === "multi") return !Array.isArray(value) || value.length === 0;
      return !formatValue(field, value);
    })
    .map((field) => field.label);
  const matches = (publication.rules?.conditions || [])
    .filter((rule) => textValue(values[rule.field]) === rule.equals);
  const photosRequired = (
    (publication.rules?.photos_policy === "required" && values.instalacao === "Sim") ||
    matches.some((rule) => rule.action === "require_photos")
  );
  if (photosRequired && !photosConfirmed) missing.push("Confirmar recebimento das fotografias do local");
  const technicalNotes = matches
    .filter((rule) => rule.action === "technical_review")
    .map((rule) => rule.message?.trim() || "Avaliação técnica necessária");
  // A exigência de parecer técnico não pode ser liberada pelo consultor com um checkbox.
  if (values.fixacao_especial === "Sim" && !technicalNotes.length) {
    technicalNotes.push("Fixação especial depende de análise técnica");
  }
  const information = matches.filter((rule) => rule.action === "note").map((rule) => rule.message).filter(Boolean);
  const availableComplements = (publication.complements || []).filter((item) => applicableComplement(item, values));
  const selected = availableComplements.filter((item) => selectedComplementIds.includes(item.id));
  const segments = [publication.name.trim()];
  for (const field of visibleFields) {
    const value = formatValue(field, values[field.id]);
    if (value) segments.push(`${field.label}: ${value}`);
  }
  for (const item of selected.filter((item) => item.mode === "included")) segments.push(item.name);
  const descriptionLines = [segments.filter(Boolean).join(" — ")];
  const unique = new Set<string>();
  for (const item of selected.filter((item) => item.mode === "separate")) {
    if (unique.has(item.id)) continue;
    unique.add(item.id);
    descriptionLines.push(`Serviço adicional: ${item.name}`);
  }
  const status: ConfigurationStatus = missing.length ? "incomplete" : technicalNotes.length ? "technical" : "ready";
  return { status, missing, technicalNotes, information, visibleFields, availableComplements, descriptionLines, photosRequired };
}

export function copyCommercialText(
  product: LibraryPublication,
  assessment: CommercialAssessment,
  final: boolean,
): string {
  if (final && assessment.status !== "ready") {
    throw new Error("A descrição final está bloqueada por pendências.");
  }
  const heading = final ? "DESCRIÇÕES PARA CONFERÊNCIA MANUAL NO CONTA AZUL" :
    "RASCUNHO PROVISÓRIO — NÃO LIBERADO PARA TRANSFERÊNCIA FINAL";
  return [
    heading, "", ...assessment.descriptionLines,
    ...(final ? [] : [
      ...(assessment.missing.length ? ["", "Campos pendentes: " + assessment.missing.join("; ")] : []),
      ...(assessment.technicalNotes.length ? ["", "Análise técnica pendente: " + assessment.technicalNotes.join("; ")] : []),
    ]),
    "", "Sem preços. O orçamento oficial deve ser elaborado e conferido no Conta Azul.",
  ].join("\n");
}
