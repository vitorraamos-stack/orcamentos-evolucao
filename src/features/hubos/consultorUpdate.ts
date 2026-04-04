import type { OsOrder } from './types';

export const CONSULTOR_ALLOWED_UPDATE_FIELDS = [
  'sale_number',
  'client_name',
  'title',
  'description',
  'delivery_date',
  'delivery_deadline_preset',
  'delivery_deadline_started_at',
  'logistic_type',
  'address',
  'art_direction_tag',
  'art_status',
  'prod_status',
  'production_tag',
  'insumos_details',
  'insumos_return_notes',
  'insumos_requested_at',
  'insumos_resolved_at',
  'insumos_resolved_by',
  'updated_at',
  'updated_by',
] as const satisfies ReadonlyArray<keyof OsOrder>;

export type ConsultorAllowedUpdateField = (typeof CONSULTOR_ALLOWED_UPDATE_FIELDS)[number];

export const toConsultorUpdatePayload = (payload: Partial<OsOrder>) => {
  const sanitized: Partial<Record<ConsultorAllowedUpdateField, OsOrder[ConsultorAllowedUpdateField]>> = {};

  for (const field of CONSULTOR_ALLOWED_UPDATE_FIELDS) {
    if (field in payload) {
      sanitized[field] = payload[field] as OsOrder[ConsultorAllowedUpdateField];
    }
  }

  return sanitized;
};

export const findForbiddenConsultorFields = (payload: Partial<OsOrder>) =>
  Object.keys(payload).filter(
    (field) => !(CONSULTOR_ALLOWED_UPDATE_FIELDS as readonly string[]).includes(field)
  );
