import type { ArtDirectionTag } from "./types";

export const ART_DIRECTION_TAG_CONFIG: Record<
  ArtDirectionTag,
  { label: string; color: string; text: string }
> = {
  ARTE_PRONTA_EDICAO: {
    label: "Arte Pronta ou Edição",
    color: "#0FB2F2",
    text: "Arte Pronta ou Edição: Até 2 dias úteis para iniciar o processo.",
  },
  CRIACAO_ARTE: {
    label: "Criação de Arte",
    color: "#F2B113",
    text: "Criação de Arte: Até 3 dias para iniciar a criação e aprovação final.",
  },
  URGENTE: {
    label: "Urgente",
    color: "#F27C13",
    text: "Urgente: Até 1 dia útil para iniciar o processo. (Sinalizar o setor sobre a demanda)",
  },
};

export const ART_DIRECTION_TAGS = Object.keys(
  ART_DIRECTION_TAG_CONFIG
) as ArtDirectionTag[];
