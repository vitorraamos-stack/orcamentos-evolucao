import { z } from "zod";
import type {
  ArtDirectionTag,
  CreateOrderItemInput,
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

export const createOrderItemInputSchema = orderItemInputSchema.extend({
  unit: z.literal("un"),
  measurement_unit: z.enum(["cm", "m"], {
    error: "Selecione cm ou m.",
  }),
});

export type CreateOrderItemDraft = z.input<typeof createOrderItemInputSchema>;
export const emptyOrderItem = (): CreateOrderItemDraft => ({
  name: "",
  description: "",
  quantity: 1,
  width_cm: null,
  height_cm: null,
  unit: "un",
  measurement_unit: "cm",
  notes: "",
  status: "PENDING",
  sort_order: 0,
});

export const normalizeCreateOrderItem = (
  item: Omit<CreateOrderItemDraft, "unit" | "measurement_unit"> & {
    unit?: unknown;
    measurement_unit?: unknown;
  }
): CreateOrderItemDraft =>
  ({
    ...item,
    measurement_unit:
      item.measurement_unit === "cm" || item.measurement_unit === "m"
        ? item.measurement_unit
        : item.unit === "cm" || item.unit === "m"
          ? item.unit
          : "cm",
    unit: "un",
  }) as CreateOrderItemDraft;

export const normalizeMeasurementToCm = (
  value: number | null | undefined,
  unit: "cm" | "m"
): number | null => {
  if (value == null) return null;
  return Number((unit === "m" ? value * 100 : value).toFixed(2));
};

export const toCreateOrderItemPayload = (
  item: z.output<typeof createOrderItemInputSchema>
): CreateOrderItemInput => ({
  name: item.name,
  description: item.description,
  quantity: item.quantity,
  width_cm: normalizeMeasurementToCm(item.width_cm, item.measurement_unit),
  height_cm: normalizeMeasurementToCm(item.height_cm, item.measurement_unit),
  unit: "un",
  notes: item.notes,
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
      input.items.every(
        item => createOrderItemInputSchema.safeParse(item).success
      ),
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
