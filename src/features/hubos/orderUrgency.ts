import type { ArtDirectionTag, OsOrder } from "./types";

export type UrgencyFields = Pick<OsOrder, "art_direction_tag"> &
  Partial<Pick<OsOrder, "is_urgent">>;

/** Keeps historical URGENTE art tags operational while priority is migrated. */
export const isOrderUrgent = (order: UrgencyFields) =>
  order.is_urgent === true || order.art_direction_tag === "URGENTE";

export const ART_DIRECTION_CHOICES = [
  "ARTE_PRONTA_EDICAO",
  "CRIACAO_ARTE",
] as const satisfies readonly ArtDirectionTag[];
