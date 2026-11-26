import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCommercialBriefing } from "./commercialBriefingDomain";
import {
  createCommercialBriefing,
  saveCommercialBriefing,
  cancelCommercialBriefing,
  parseCommercialBriefingRow,
} from "./commercialBriefingRepository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const id = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const draft = emptyCommercialBriefing();
const row = {
  id,
  consultant_id: owner,
  digisac_contact_id: "contact-fixture",
  digisac_ticket_id: null,
  context_verified_at: null,
  schema_version: 1,
  revision: 1,
  commercial_revision: 1,
  draft,
  confirmation: null,
  os_id: null,
  cancelled_at: null,
  created_at: "2026-11-26T18:00:00Z",
  updated_at: "2026-11-26T18:00:00Z",
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: row, error: null });
});

describe("commercial briefing repository", () => {
  it("maps snake-case database metadata and distinguishes unverified context", () => {
    expect(parseCommercialBriefingRow(row)).toMatchObject({
      id, consultantId: owner, contextVerifiedAt: null, revision: 1,
      commercialRevision: 1, confirmation: null, osId: null,
    });
    expect(parseCommercialBriefingRow([row]).id).toBe(id);
  });
  it("rejects malformed responses and unsupported schema versions", () => {
    for (const invalid of [null, [], { ...row, schema_version: 2 },
      { ...row, commercial_revision: 2 }]) {
      expect(() => parseCommercialBriefingRow(invalid)).toThrow(
        "Não foi possível acessar o briefing comercial."
      );
    }
  });
  it("creates using only allowed draft fields and a stable UUID", async () => {
    await createCommercialBriefing({ id, contactId: "contact-fixture", ticketId: null, draft });
    expect(mocks.rpc).toHaveBeenCalledWith("commercial_briefing_create", {
      p_id: id, p_contact_id: "contact-fixture", p_ticket_id: null, p_draft: draft,
    });
  });
  it("rejects ownership injection before the RPC", async () => {
    const input = { id, contactId: "contact-fixture", ticketId: null, draft, consultantId: owner };
    await expect(createCommercialBriefing(input)).rejects.toMatchObject({ code: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves with the explicit expected revision", async () => {
    await saveCommercialBriefing({ id, expectedRevision: 1, draft });
    expect(mocks.rpc).toHaveBeenCalledWith("commercial_briefing_save", {
      p_id: id, p_expected_revision: 1, p_draft: draft,
    });
  });
  it("surfaces conflict without retrying or exposing database details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "private SQL details" } });
    await expect(saveCommercialBriefing({ id, expectedRevision: 1, draft }))
      .rejects.toMatchObject({ code: "conflict" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid revisions before sending", async () => {
    await expect(saveCommercialBriefing({ id, expectedRevision: 0, draft }))
      .rejects.toMatchObject({ code: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("cancels without deleting and uses the expected revision", async () => {
    await cancelCommercialBriefing({ id, expectedRevision: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("commercial_briefing_cancel", {
      p_id: id, p_expected_revision: 1,
    });
  });
});
