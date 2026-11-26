import type { ContextDiagnostic, DigisacContext } from "../../../shared/digisac/context.js";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}
// Recognize only a direct record or an unambiguous data object.
// This is a diagnostic parser, not an authorization or identity-binding rule.
function record(value: unknown): JsonObject | null {
  const outer = object(value);
  if (!outer) return null;
  if (typeof outer.id === "string") return outer;
  return object(outer.data);
}
function matches(value: unknown, expected: string): boolean | null {
  return typeof value === "string" ? value === expected : null;
}
function present(value: unknown): boolean | null {
  return typeof value === "string" ? value.trim().length > 0 : null;
}

function inspectContactAndTicket(refs: DigisacContext, contact: JsonObject | null, ticket: JsonObject | null) {
  return {
    contactId: matches(contact?.id, refs.contactId),
    ticketId: matches(ticket?.id, refs.ticketId),
    ticketContact: matches(ticket?.contactId, refs.contactId),
    ticketOpen: typeof ticket?.isOpen === "boolean" ? ticket.isOpen : null,
  };
}

export function inspectDigisacConsultation(refs: DigisacContext, contact: unknown, ticket: unknown) {
  return inspectContactAndTicket(refs, record(contact), record(ticket));
}

export function inspectDigisacContext(
  refs: DigisacContext,
  responses: { contact: unknown; ticket: unknown; user: unknown },
  confirmedEmail: string | null,
): ContextDiagnostic {
  const contact = record(responses.contact);
  const ticket = record(responses.ticket);
  const user = record(responses.user);
  const digisacEmail = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  const evoluSystemEmail = confirmedEmail?.trim().toLowerCase();
  const accountEmail = digisacEmail && evoluSystemEmail
    ? digisacEmail === evoluSystemEmail
    : null;
  return {
    ...inspectContactAndTicket(refs, contact, ticket),
    ticketAssignee: matches(ticket?.userId, refs.userId),
    userId: matches(user?.id, refs.userId),
    accountEmail,
    contactName: present(contact?.name),
    contactPhone: present(object(contact?.data)?.number ?? contact?.number),
  };
}
