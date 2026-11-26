import { ART_DIRECTION_TAG_CONFIG } from "@/features/hubos/artDirectionTagConfig";
import { DELIVERY_DEADLINE_PRESET_CONFIG } from "@/features/hubos/deliveryDeadlineConfig";
import { formatDatePtBr } from "@/features/hubos/deliveryDeadline";
import { formatOrderItemQuantity } from "@/features/hubos/createOrderDomain";
import {
  canConfirmCommercialBriefing,
  commercialBriefingDraftSchema,
  type CommercialBriefingDraft,
} from "./commercialBriefingDomain";

export const COMMERCIAL_LOGISTICS_LABELS = {
  retirada: "Retirada",
  entrega: "Entrega",
  instalacao: "Instalação",
} as const;

export const COMMERCIAL_COMPLETION_LABELS = {
  customer: "Cliente",
  items: "Itens e quantidades válidos",
  artwork: "Necessidade de Arte",
  deadline: "Prazo contratado",
  logistics: "Logística",
  sale: "Número da venda no Conta Azul",
  artInstructions: "Orientações internas de Arte",
} as const;

/** Canonical snapshot for dirty detection, not for authorization. */
export function sameCommercialDraft(left: CommercialBriefingDraft, right: CommercialBriefingDraft) {
  // Both inputs use the stable field order of the shared schema. JSONB can
  // reorder object keys; parsing the response prevents a false dirty state.
  const a = commercialBriefingDraftSchema.safeParse(left);
  const b = commercialBriefingDraftSchema.safeParse(right);
  return a.success && b.success && JSON.stringify(a.data) === JSON.stringify(b.data);
}

const numberPtBr = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 10 });
const supplied = (value: number | string | null) => value != null && String(value).trim() !== "";

/** A customer-facing preview only. No network call, confirmation or sending. */
export function buildCommercialSummary(draft: CommercialBriefingDraft): string | null {
  if (!canConfirmCommercialBriefing(draft) || !draft.artDirectionTag ||
      !draft.deadlinePreset || !draft.logisticType) return null;

  const lines = [
    "CONFIRMAÇÃO DO PEDIDO | EVOLUÇÃO",
    "",
    "Cliente: " + draft.clientName.trim(),
    "",
    "Itens:",
  ];
  draft.items.forEach((item, index) => {
    lines.push((index + 1) + ". " + item.name.trim() + " — " + formatOrderItemQuantity(item.quantity));
    if (supplied(item.width_cm)) lines.push("   Largura: " + numberPtBr.format(Number(item.width_cm)) + " " + item.measurement_unit);
    if (supplied(item.height_cm)) lines.push("   Altura: " + numberPtBr.format(Number(item.height_cm)) + " " + item.measurement_unit);
    if (item.description.trim()) lines.push("   Especificações: " + item.description.trim());
  });
  const deadline = draft.deadlinePreset === "CUSTOM"
    ? "Data acordada: " + formatDatePtBr(draft.deliveryDate)
    : DELIVERY_DEADLINE_PRESET_CONFIG[draft.deadlinePreset].label;
  lines.push("", "Arte: " + ART_DIRECTION_TAG_CONFIG[draft.artDirectionTag].label,
    "Prazo: " + deadline, "Logística: " + COMMERCIAL_LOGISTICS_LABELS[draft.logisticType]);
  if (draft.logisticType !== "retirada") lines.push("Endereço: " + draft.address.trim());
  if (draft.commercialNotes.trim()) lines.push("", "Observações comerciais: " + draft.commercialNotes.trim());
  lines.push("", "As informações estão corretas?");
  return lines.join("\n");
}
