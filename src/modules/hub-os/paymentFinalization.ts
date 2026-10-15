import type { OsEvent, PaymentStatus } from "./types";

export type LegacyPaymentFinalization = {
  payment_id: string;
  payment_status: PaymentStatus;
  current_os_payment_status: PaymentStatus;
  already_submitted: boolean;
};

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "PENDING", "UNDER_REVIEW", "RELEASED", "BLOCKED", "SCHEDULED",
]);

// Never trust an unvalidated RPC response to mark the financial submission as saved.
export const parseLegacyPaymentFinalization = (
  data: unknown,
  expectedProofId: string
): LegacyPaymentFinalization => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Resposta de finalização financeira inválida.");
  }

  const result = data as Record<string, unknown>;
  if (
    result.payment_id !== expectedProofId ||
    !VALID_STATUSES.has(String(result.payment_status)) ||
    !VALID_STATUSES.has(String(result.current_os_payment_status)) ||
    typeof result.already_submitted !== "boolean"
  ) {
    throw new Error("Resposta financeira inconsistente. Confira o histórico antes de reenviar.");
  }

  return result as LegacyPaymentFinalization;
};

// Read-only evidence for ambiguous RPC responses; this does NOT write or retry.
export const hasOwnSubmittedPaymentEvent = (
  events: ReadonlyArray<Pick<OsEvent, "type" | "payload" | "created_by">>,
  proofId: string,
  actorId: string | null | undefined
): boolean =>
  Boolean(actorId) &&
  events.some(
    event =>
      event.type === "PAYMENT_SUBMITTED" &&
      event.payload?.payment_id === proofId &&
      event.created_by === actorId
  );
