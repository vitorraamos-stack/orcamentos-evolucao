import type { DeliveryDeadlinePreset } from "./types";

export type DeliveryDeadlinePresetConfig = {
  label: string;
  tooltip: string;
  upperBusinessDays: number | null;
};

export const DELIVERY_DEADLINE_PRESET_CONFIG: Record<
  DeliveryDeadlinePreset,
  DeliveryDeadlinePresetConfig
> = {
  FAST_5_8: {
    label: "De 5 à 8 dias úteis, após a aprovação da arte",
    tooltip: "Produção rápida (adesivos simples, banner simples).",
    upperBusinessDays: 8,
  },
  STANDARD_8_12: {
    label: "De 8 à 12 dias úteis, após a aprovação da arte",
    tooltip:
      "Produção demorada (Adesivos grandes, Lonas, Plotagens, PVC, Acrílicos).",
    upperBusinessDays: 12,
  },
  STRUCTURE_INSTALL_15_25: {
    label: "De 15 à 25 dias úteis, após a aprovação da arte",
    tooltip: "Placas com estruturas e instalação.",
    upperBusinessDays: 25,
  },
  CUSTOM: {
    label: "Prazo Personalizado (Consultar Produção/Gerência)",
    tooltip:
      "Use quando a produção orientar um prazo específico fora das faixas padrão.",
    upperBusinessDays: null,
  },
};

export const DELIVERY_DEADLINE_PRESETS = Object.keys(
  DELIVERY_DEADLINE_PRESET_CONFIG
) as DeliveryDeadlinePreset[];
