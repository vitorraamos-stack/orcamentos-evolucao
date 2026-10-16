import type { Os, OsEvent } from "./types";

/**
 * Defense in depth only: these checks do not replace database ACL/RLS.
 * A malicious client can bypass this module and call the Data API.
 */
const FINANCIAL_FIELDS = ["payment_status", "quote_total", "quote_id"] as const;

export const assertOperationalOsUpdate = (payload: Partial<Os>): void => {
  if (FINANCIAL_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(payload, field)
  )) {
    throw new Error("Campos financeiros exigem fluxo de atualização autorizado.");
  }
};

export const assertOperationalOsCreate = (payload: Partial<Os>): void => {
  if (
    (payload.payment_status !== undefined &&
      payload.payment_status !== null &&
      payload.payment_status !== "PENDING") ||
    payload.quote_total != null ||
    payload.quote_id != null
  ) {
    throw new Error("A criação de OS não pode definir valores financeiros diretamente.");
  }
};

export const assertOperationalOsEvent = (payload: Partial<OsEvent>): void => {
  if (payload.type === "PAYMENT_SUBMITTED") {
    throw new Error("Eventos de pagamento devem ser registrados pela finalização transacional.");
  }
};
