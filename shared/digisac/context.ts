import { z } from "zod";

// The three values passed by Digisac are untrusted references, NOT identity.
const reference = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
export const digisacContextSchema = z.object({
  contactId: reference,
  ticketId: reference,
  userId: reference,
}).strict();
export type DigisacContext = z.infer<typeof digisacContextSchema>;
export function readDigisacContext(search: string): DigisacContext | null {
  const params = new URLSearchParams(search);
  const keys = ["contact_id", "ticket_id", "user_id"] as const;
  if (keys.some(key => params.getAll(key).length !== 1)) return null;
  const result = digisacContextSchema.safeParse({
    contactId: params.get("contact_id"),
    ticketId: params.get("ticket_id"),
    userId: params.get("user_id"),
  });
  return result.success ? result.data : null;
}
export const contextChecks = [
  "contactId", "ticketId", "ticketContact", "ticketOpen",
  "ticketAssignee", "userId", "accountEmail", "contactName", "contactPhone",
] as const;
export const contextDiagnosticSchema = z.object({
  contactId: z.boolean().nullable(),
  ticketId: z.boolean().nullable(),
  ticketContact: z.boolean().nullable(),
  ticketOpen: z.boolean().nullable(),
  ticketAssignee: z.boolean().nullable(),
  userId: z.boolean().nullable(),
  accountEmail: z.boolean().nullable(),
  contactName: z.boolean().nullable(),
  contactPhone: z.boolean().nullable(),
}).strict();
export type ContextDiagnostic = z.infer<typeof contextDiagnosticSchema>;
