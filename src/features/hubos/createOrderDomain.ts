import { z } from "zod";
import type {
  ArtDirectionTag,
  DeliveryDeadlinePreset,
  LogisticType,
} from "./types";

const optionalText = (max: number) =>
  z.preprocess(
    value => (value === "" ? null : value),
    z.string().trim().max(max).nullable().optional()
  );
const optionalPositiveNumber = z.preprocess(
  value => (value === "" || value == null ? null : value),
  z.coerce.number().positive().max(100000).nullable().optional()
);

export const orderItemInputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do item.").max(160),
  description: optionalText(4000),
  quantity: z.coerce
    .number()
    .positive("A quantidade deve ser maior que zero.")
    .max(100000),
  width_cm: optionalPositiveNumber,
  height_cm: optionalPositiveNumber,
  unit: z.string().trim().min(1, "Informe a unidade.").max(30),
  notes: optionalText(4000),
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "CANCELLED"]),
  sort_order: z.coerce.number().int().min(0),
});

export type CreateOrderItemDraft = z.input<typeof orderItemInputSchema>;
export const emptyOrderItem = (): CreateOrderItemDraft => ({
  name: "",
  description: "",
  quantity: 1,
  width_cm: null,
  height_cm: null,
  unit: "un",
  notes: "",
  status: "PENDING",
  sort_order: 0,
});

export type CreateOrderCompletionInput = {
  saleNumber: string;
  clientName: string;
  description: string;
  items: CreateOrderItemDraft[];
  artDirectionTag: ArtDirectionTag | null;
  deadlinePreset: DeliveryDeadlinePreset | null;
  deliveryDate: string;
  logisticType: LogisticType;
  address: string;
};

export function getCreateOrderCompletion(input: CreateOrderCompletionInput) {
  return {
    identification: Boolean(input.saleNumber.trim() && input.clientName.trim()),
    items:
      input.items.length > 0 &&
      input.items.every(item => orderItemInputSchema.safeParse(item).success),
    briefing: Boolean(input.description.trim()),
    artwork:
      input.artDirectionTag === "ARTE_PRONTA_EDICAO" ||
      input.artDirectionTag === "CRIACAO_ARTE",
    deadline: Boolean(
      input.deadlinePreset &&
      (input.deadlinePreset !== "CUSTOM" || input.deliveryDate)
    ),
    logistics:
      input.logisticType === "retirada" || Boolean(input.address.trim()),
  };
}
