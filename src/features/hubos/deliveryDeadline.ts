import { DELIVERY_DEADLINE_PRESET_CONFIG } from "./deliveryDeadlineConfig";
import type { DeliveryDeadlinePreset } from "./types";

export const formatDateToYmd = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDatePtBr = (value?: string | null) => {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return value;
};

export const addBusinessDays = (
  startDate: Date | string,
  businessDays: number
) => {
  const date =
    startDate instanceof Date ? new Date(startDate) : new Date(startDate);
  if (Number.isNaN(date.getTime())) return null;

  const direction = businessDays >= 0 ? 1 : -1;
  let remaining = Math.abs(businessDays);

  while (remaining > 0) {
    date.setDate(date.getDate() + direction);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return date;
};

export const resolveDeliveryDate = ({
  preset,
  startedAt,
  manualDate,
}: {
  preset: DeliveryDeadlinePreset | null;
  startedAt?: string | null;
  manualDate?: string | null;
}) => {
  if (!preset) return null;
  if (preset === "CUSTOM") return manualDate ?? null;

  const config = DELIVERY_DEADLINE_PRESET_CONFIG[preset];
  if (!config.upperBusinessDays || !startedAt) return null;
  const resolved = addBusinessDays(startedAt, config.upperBusinessDays);
  return resolved ? formatDateToYmd(resolved) : null;
};

export const getProductionDeadlineBadgeText = ({
  preset,
  deliveryDate,
}: {
  preset?: DeliveryDeadlinePreset | null;
  deliveryDate?: string | null;
}) => {
  if (!preset) {
    return deliveryDate
      ? `Entrega: ${formatDatePtBr(deliveryDate)}`
      : "Entrega pendente";
  }

  if (preset === "CUSTOM") {
    return deliveryDate
      ? `Entrega personalizada: ${formatDatePtBr(deliveryDate)}`
      : "Entrega personalizada pendente";
  }

  return deliveryDate
    ? `Entrega prevista: ${formatDatePtBr(deliveryDate)}`
    : `Entrega prevista: ${DELIVERY_DEADLINE_PRESET_CONFIG[preset].label}`;
};
