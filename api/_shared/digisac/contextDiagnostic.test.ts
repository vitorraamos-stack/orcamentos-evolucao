import { describe, expect, it } from "vitest";
import { readDigisacContext, contextDiagnosticSchema } from "../../../shared/digisac/context";
import { inspectDigisacContext } from "./contextDiagnostic";

const refs = { contactId: "c-1", ticketId: "t-1", userId: "u-1" };
const responses = {
  contact: { id: "c-1", name: "PRIVATE_NAME", data: { number: "PRIVATE_PHONE" } },
  ticket: { id: "t-1", contactId: "c-1", userId: "u-1", isOpen: true },
  user: { id: "u-1", email: "private@example.invalid" },
};

describe("Digisac context diagnostic", () => {
  it("accepts exactly one valid value for each reference", () => {
    expect(readDigisacContext("?contact_id=c-1&ticket_id=t-1&user_id=u-1")).toEqual(refs);
    for (const query of ["?contact_id=c-1", "?contact_id=c-1&contact_id=c-2&ticket_id=t-1&user_id=u-1",
      "?contact_id={{contactId}}&ticket_id=t-1&user_id=u-1",
      "?contact_id=..%2Fusers&ticket_id=t-1&user_id=u-1"]) expect(readDigisacContext(query)).toBeNull();
  });
  it("returns only booleans for direct or wrapped records, never provider values", () => {
    const result = inspectDigisacContext(refs, responses, "PRIVATE@example.invalid");
    expect(contextDiagnosticSchema.parse(result)).toEqual(result);
    expect(Object.values(result).every(value => value === true)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("example.invalid");
    expect(inspectDigisacContext(refs, { ...responses, contact: { data: responses.contact } }, null).contactPhone).toBe(true);
  });
  it("does not confuse an unrelated ticket or assignee with a match", () => {
    const result = inspectDigisacContext(refs, { ...responses, ticket: {
      id: "t-2", contactId: "c-2", userId: "u-2", isOpen: false,
    } }, "another@example.invalid");
    expect(result).toMatchObject({ ticketId: false, ticketContact: false, ticketAssignee: false, ticketOpen: false, accountEmail: false });
  });
  it("fails closed on undocumented shapes and unconfirmed identity", () => {
    const result = inspectDigisacContext(refs, { contact: [], ticket: {}, user: null }, null);
    expect(Object.values(result).every(value => value === null)).toBe(true);
    expect(inspectDigisacContext(refs, responses, null).accountEmail).toBeNull();
  });
});
