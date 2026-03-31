import { addBusinessDays } from "./deliveryDeadline";
import type { ArtDirectionTag, OsOrder } from "./types";

type DesignerSlaKind = "business" | "calendar";

type DesignerSlaConfig = {
  days: number;
  kind: DesignerSlaKind;
  message: string;
};

export type DesignerSlaState = "healthy" | "warning" | "dueToday" | "overdue";

const DESIGNER_SLA_CONFIG: Record<ArtDirectionTag, DesignerSlaConfig> = {
  ARTE_PRONTA_EDICAO: {
    days: 2,
    kind: "business",
    message: "Até 2 dias úteis para iniciar o processo.",
  },
  CRIACAO_ARTE: {
    // Regra explícita: "Até 3 dias" (corridos), conforme regra de negócio.
    days: 3,
    kind: "calendar",
    message: "Até 3 dias para iniciar a criação e aprovação final.",
  },
  URGENTE: {
    days: 1,
    kind: "business",
    message:
      "Até 1 dia útil para iniciar o processo. (Sinalizar o setor sobre a demanda)",
  },
};

const dayMs = 24 * 60 * 60 * 1000;

const startOfDay = (value: Date | string) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const diffInDays = (from: Date, to: Date) =>
  Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / dayMs);

export const getDesignerSlaConfig = (tag?: ArtDirectionTag | null) => {
  if (!tag) return null;
  return DESIGNER_SLA_CONFIG[tag] ?? null;
};

export const resolveDesignerSlaDeadline = (
  order: Pick<OsOrder, "art_direction_tag" | "created_at">
) => {
  const config = getDesignerSlaConfig(order.art_direction_tag);
  if (!config) return null;

  const baseDate = new Date(order.created_at);
  if (Number.isNaN(baseDate.getTime())) return null;

  if (config.kind === "business") {
    return addBusinessDays(baseDate, config.days);
  }

  const deadline = new Date(baseDate);
  deadline.setDate(deadline.getDate() + config.days);
  return deadline;
};

export const getDesignerSlaState = (
  order: Pick<OsOrder, "art_direction_tag" | "created_at">
): DesignerSlaState | null => {
  const config = getDesignerSlaConfig(order.art_direction_tag);
  const deadline = resolveDesignerSlaDeadline(order);
  if (!config || !deadline) return null;

  const today = startOfDay(new Date());
  const remainingDays = diffInDays(today, deadline);

  if (remainingDays < 0) return "overdue";
  if (remainingDays === 0) return "dueToday";
  if (remainingDays <= Math.ceil(config.days / 2)) return "warning";
  return "healthy";
};

export const getDesignerSlaLabel = (
  order: Pick<OsOrder, "art_direction_tag" | "created_at">
) => {
  const deadline = resolveDesignerSlaDeadline(order);
  const state = getDesignerSlaState(order);
  if (!deadline || !state) return null;

  const today = startOfDay(new Date());
  const delta = diffInDays(today, deadline);

  if (state === "overdue") {
    const daysLate = Math.abs(delta);
    return `SLA Arte: atrasado há ${daysLate} ${daysLate === 1 ? "dia" : "dias"}`;
  }
  if (state === "dueToday") {
    return "SLA Arte: vence hoje";
  }
  return `SLA Arte: ${delta} ${delta === 1 ? "dia restante" : "dias restantes"}`;
};
