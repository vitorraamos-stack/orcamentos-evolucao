import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./digisac-context-check";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), access: vi.fn(),
  getContact: vi.fn(), getTicket: vi.fn(), getUser: vi.fn(),
  readerConfig: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(),
  range: vi.fn(), limit: vi.fn(), in: vi.fn(), lt: vi.fn(), actorRpc: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: unknown) => {
    if (key === "fixture-public-key") {
      mocks.readerConfig(url, key, options);
      const query = {
        eq: mocks.eq, is: mocks.is, order: mocks.order, in: mocks.in, lt: mocks.lt, range: mocks.range,
        limit: (...args: [number, { referencedTable: string }?]) => {
          const result = mocks.limit(...args);
          return args[1] ? query : result;
        },
      };
      mocks.eq.mockReturnValue(query);
      mocks.is.mockReturnValue(query);
      mocks.order.mockReturnValue(query);
      mocks.in.mockReturnValue(query);
      mocks.lt.mockReturnValue(query);
      return { rpc: mocks.actorRpc, from: (table: string) => ({ select: (columns: string) => {
        mocks.select(table, columns);
        return query;
      } }) };
    }
    return {
      auth: { getUser: mocks.auth },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
      rpc: mocks.access,
    };
  },
}));
vi.mock("./_shared/digisac/readClient.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./_shared/digisac/readClient")>();
  return { ...actual, digisacReadClientFromEnv: () => ({
    getContact: mocks.getContact, getTicket: mocks.getTicket, getUser: mocks.getUser,
  }) };
});
const refs = { contactId: "c-1", ticketId: "t-1", userId: "u-1" };
const consultation = { ...refs, action: "consult" };
const prepareCreation = { contactId: refs.contactId, ticketId: refs.ticketId, action: "prepare_create" };
const storedDraft = {
  saleNumber: "", clientName: "Cliente de teste", items: [], commercialNotes: "",
  artInstructions: "", artDirectionTag: null, isUrgent: false, deadlinePreset: null,
  deliveryDate: "", logisticType: null, address: "",
};
const creation = {
  ...prepareCreation, action: "create", id: "10000000-0000-4000-8000-000000000001", draft: storedDraft,
};
async function invoke(body: unknown = refs, authorization = "Bearer fixture", method = "POST") {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers: { authorization }, body }, res);
  return { status: res.status.mock.calls[0][0], payload: res.json.mock.calls[0][0] };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-key");
  vi.stubEnv("SUPABASE_ANON_KEY", "fixture-public-key");
  mocks.auth.mockResolvedValue({ data: { user: { id: "manager-fixture", email: "private@example.invalid", email_confirmed_at: "fixture-date" } }, error: null });
  mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
  mocks.access.mockResolvedValue({ data: true, error: null });
  mocks.getContact.mockResolvedValue({ id: "c-1", name: "PRIVATE_NAME", data: { number: "PRIVATE_PHONE" } });
  mocks.getTicket.mockResolvedValue({ id: "t-1", contactId: "c-1", userId: "u-1", isOpen: true });
  mocks.getUser.mockResolvedValue({ id: "u-1", email: "private@example.invalid" });
  mocks.limit.mockResolvedValue({ data: [], error: null });
  mocks.range.mockResolvedValue({ data: [], error: null });
  mocks.actorRpc.mockResolvedValue({ data: creation.id, error: null });
});

describe("Digisac briefing creation in the signed-in commercial session", () => {
  beforeEach(() => {
    mocks.profile.mockResolvedValue({ data: { role: "consultor_vendas" }, error: null });
  });

  it("prepares the first-party form for a consultant without creating a draft", async () => {
    expect(await invoke(prepareCreation)).toEqual({
      status: 200, payload: { ok: true, code: "BRIEFING_READY", drafts: [], hasMore: false },
    });
    expect(mocks.getContact).toHaveBeenCalledWith(refs.contactId);
    expect(mocks.getTicket).toHaveBeenCalledWith(refs.ticketId);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.actorRpc).not.toHaveBeenCalled();
    expect(mocks.eq.mock.calls).toEqual([
      ["consultant_id", "manager-fixture"], ["digisac_contact_id", "c-1"], ["digisac_ticket_id", "t-1"],
    ]);
    expect(mocks.is.mock.calls).toEqual([["cancelled_at", null], ["os_id", null]]);
    expect(mocks.range).toHaveBeenCalledWith(0, 50);
  });

  it("returns multiple editable drafts without creating or choosing between them", async () => {
    const first = { id: creation.id, client_name: "Neste chamado", updated_at: "2026-11-26T00:00:00Z" };
    const second = { ...first, id: "10000000-0000-4000-8000-000000000002" };
    mocks.range.mockResolvedValue({ data: [first, second], error: null });
    expect(await invoke(prepareCreation)).toEqual({
      status: 200, payload: { ok: true, code: "BRIEFING_READY", drafts: [first, second], hasMore: false },
    });
    expect(mocks.actorRpc).not.toHaveBeenCalled();
  });

  it("creates only through the guarded draft RPC with the consultant's JWT and the exact context", async () => {
    expect(await invoke(creation)).toEqual({ status: 200, payload: { ok: true, code: "BRIEFING_CREATED" } });
    expect(mocks.readerConfig).toHaveBeenCalledWith("https://example.invalid", "fixture-public-key",
      expect.objectContaining({ global: { headers: { Authorization: "Bearer fixture" } } }));
    expect(mocks.actorRpc).toHaveBeenCalledTimes(1);
    expect(mocks.actorRpc).toHaveBeenCalledWith("commercial_briefing_create_for_digisac", {
      p_id: creation.id,
      p_contact_id: refs.contactId,
      p_ticket_id: refs.ticketId,
      p_draft: storedDraft,
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("reports an existing draft instead of creating another when the guarded RPC finds a match", async () => {
    mocks.actorRpc.mockResolvedValue({ data: null, error: null });
    expect(await invoke(creation)).toEqual({ status: 200, payload: { ok: true, code: "BRIEFING_EXISTS" } });
    expect(mocks.actorRpc).toHaveBeenCalledTimes(1);
  });

  it("preserves management-only access to the diagnostic and existing briefing consultation", async () => {
    expect((await invoke()).status).toBe(403);
    expect((await invoke(consultation)).status).toBe(403);
    expect(mocks.getContact).not.toHaveBeenCalled();
    expect(mocks.actorRpc).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated, non-commercial and module-restricted actors", async () => {
    expect((await invoke(creation, "")).status).toBe(401);
    mocks.access.mockResolvedValueOnce({ data: false, error: null });
    expect((await invoke(creation)).status).toBe(403);
    mocks.profile.mockResolvedValue({ data: { role: "arte" }, error: null });
    expect((await invoke(prepareCreation)).status).toBe(403);
    expect((await invoke(creation)).status).toBe(403);
    expect(mocks.getContact).not.toHaveBeenCalled();
    expect(mocks.actorRpc).not.toHaveBeenCalled();
  });

  it("revalidates an open, matching ticket before saving and rejects injected actor fields", async () => {
    expect((await invoke({ ...creation, userId: "u-1" })).status).toBe(400);
    expect((await invoke({ ...creation, consultantId: "different-actor" })).status).toBe(400);
    mocks.getTicket.mockResolvedValue({ id: refs.ticketId, contactId: refs.contactId, isOpen: false });
    expect(await invoke(creation)).toEqual({
      status: 422, payload: { ok: false, code: "CONTEXT_NOT_VERIFIED" },
    });
    expect(mocks.actorRpc).not.toHaveBeenCalled();
  });

  it("maps a draft validation failure without disclosing database details", async () => {
    mocks.actorRpc.mockResolvedValue({ data: null, error: { code: "22023", message: "private" } });
    expect(await invoke(creation)).toEqual({ status: 422, payload: { ok: false, code: "BRIEFING_INVALID" } });
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("manager-only Digisac context check", () => {
  it("returns minimized checks only, not raw data or identifiers", async () => {
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ ok: true, code: "CONTEXT_INSPECTED", checks: { ticketContact: true, ticketAssignee: true, accountEmail: true } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|example.invalid|c-1|t-1|u-1/);
    expect(mocks.getContact).toHaveBeenCalledWith("c-1");
    expect(mocks.getTicket).toHaveBeenCalledWith("t-1");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and non-manager calls before touching Digisac", async () => {
    expect((await invoke(refs, "")).status).toBe(401);
    expect((await invoke(refs, "Bearer fixture", "GET")).status).toBe(405);
    mocks.profile.mockResolvedValue({ data: { role: "consultor_vendas" }, error: null });
    expect((await invoke()).status).toBe(403);
    mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
    mocks.access.mockResolvedValue({ data: false, error: null });
    expect((await invoke()).status).toBe(403);
    expect(mocks.getContact).not.toHaveBeenCalled();
    expect(mocks.getTicket).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([
    [" PRIVATE@example.invalid ", true],
    ["another@example.invalid", false],
    [" ", null],
    [undefined, null],
  ])("distinguishes an absent e-mail from a mismatch (%s)", async (email, expected) => {
    mocks.getUser.mockResolvedValue({ id: "u-1", email });
    expect((await invoke()).payload.checks.accountEmail).toBe(expected);
  });
  it("rejects arbitrary fields and invalid references", async () => {
    expect((await invoke({ ...refs, userId: "../users" })).status).toBe(400);
    expect((await invoke({ ...refs, role: "gerente" })).status).toBe(400);
    expect(mocks.getContact).not.toHaveBeenCalled();
  });
});

describe("manager-only Digisac briefing consultation", () => {
  it("returns the stored revision and last save without treating cancellation as a save", async () => {
    const savedAt = "2026-11-27T13:35:00+00:00";
    mocks.limit.mockResolvedValue({ data: [{
      draft: storedDraft, revision: 3, cancelled_at: "2026-11-27T13:40:00+00:00", os_id: "private-os-id",
      saves: [{ occurred_at: savedAt, actor_id: "last-saving-consultant" }],
      history: [
        { revision: 3, occurred_at: "2026-11-27T13:40:00+00:00", event: "CANCELLED", actor_id: "closing-consultant" },
        { revision: 2, occurred_at: savedAt, event: "SAVED", actor_id: "last-saving-consultant", changed_fields: ["artInstructions"] },
      ],
    }], error: null });
    mocks.actorRpc.mockResolvedValue({ data: [
      { id: "last-saving-consultant", full_name: " Consultora de Teste ", email: "private-author@example.invalid" },
      { id: "closing-consultant", full_name: "another-private-author@example.invalid" },
    ], error: null });
    mocks.getUser.mockResolvedValue({ id: "u-1", email: "another@example.invalid" });
    expect(await invoke(consultation)).toEqual({
      status: 200, payload: {
        ok: true, code: "BRIEFING_FOUND", briefing: { draft: storedDraft, state: "cancelled" },
        revision: 3, lastSavedAt: savedAt, lastSavedBy: "Consultora de Teste",
        history: { entries: [
          { revision: 3, occurredAt: "2026-11-27T13:40:00+00:00", event: "CANCELLED", authorName: null, changedFields: null },
          {
            revision: 2, occurredAt: savedAt, event: "SAVED", authorName: "Consultora de Teste",
            changedFields: ["artInstructions"],
          },
        ], nextBefore: null },
      },
    });
    expect(mocks.readerConfig).toHaveBeenCalledWith("https://example.invalid", "fixture-public-key",
      expect.objectContaining({ global: { headers: { Authorization: "Bearer fixture" } } }));
    expect(mocks.select).toHaveBeenCalledWith("commercial_briefings",
      "draft, revision, cancelled_at, os_id, saves:commercial_briefing_revisions(occurred_at, actor_id), history:commercial_briefing_revisions(revision, occurred_at, event, actor_id, changed_fields)");
    expect(mocks.eq).toHaveBeenCalledWith("digisac_contact_id", refs.contactId);
    expect(mocks.in).toHaveBeenCalledWith("saves.event", ["CREATED", "SAVED"]);
    expect(mocks.order).toHaveBeenCalledWith("revision", { ascending: false, referencedTable: "saves" });
    expect(mocks.limit).toHaveBeenCalledWith(1, { referencedTable: "saves" });
    expect(mocks.limit).toHaveBeenCalledWith(2);
    expect(mocks.actorRpc).toHaveBeenCalledWith("get_user_display_names", { user_ids: ["closing-consultant", "last-saving-consultant"] });
    expect(mocks.actorRpc).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("paginates revision metadata with an exclusive cursor without sending the briefing draft", async () => {
    const occurredAt = "2026-11-27T13:35:00+00:00";
    const revisions = Array.from({ length: 21 }, (_, index) => ({
      revision: 30 - index, occurred_at: occurredAt, event: "SAVED", actor_id: "consultant",
      changed_fields: ["private@example.invalid"],
    }));
    mocks.limit.mockResolvedValue({ data: [{ history: revisions }], error: null });
    mocks.actorRpc.mockResolvedValue({ data: [{ id: "consultant", full_name: "Consultora de Teste" }], error: null });
    expect(await invoke({ ...consultation, historyBefore: 31 })).toEqual({
      status: 200, payload: {
        ok: true, code: "BRIEFING_HISTORY",
        history: { entries: revisions.slice(0, 20).map(({ revision }) => ({
          revision, occurredAt, event: "SAVED", authorName: "Consultora de Teste", changedFields: null,
        })), nextBefore: 11 },
      },
    });
    expect(mocks.lt).toHaveBeenCalledWith("history.revision", 31);
    expect(mocks.limit).toHaveBeenCalledWith(21, { referencedTable: "history" });
    expect(mocks.actorRpc).toHaveBeenCalledWith("get_user_display_names", { user_ids: ["consultant"] });
    expect(mocks.select).toHaveBeenCalledWith("commercial_briefings",
      "history:commercial_briefing_revisions(revision, occurred_at, event, actor_id, changed_fields)");
  });

  it.each(["private-author@example.invalid", null])(
    "keeps the last save available without exposing an e-mail or an absent author name", async fullName => {
      const savedAt = "2026-11-27T13:35:00+00:00";
      mocks.limit.mockResolvedValue({ data: [{
        draft: storedDraft, revision: 2, cancelled_at: null, os_id: null,
        saves: [{ occurred_at: savedAt, actor_id: "last-saving-consultant" }],
      }], error: null });
      mocks.actorRpc.mockResolvedValue({ data: [{
        id: "last-saving-consultant", full_name: fullName, email: "private-author@example.invalid",
      }], error: null });
      expect(await invoke(consultation)).toEqual({
        status: 200, payload: {
          ok: true, code: "BRIEFING_FOUND", briefing: { draft: storedDraft, state: "draft" },
          revision: 2, lastSavedAt: savedAt, lastSavedBy: null,
          history: { entries: [], nextBefore: null },
        },
      });
    }
  );

  it("returns only the no-match result for a contact without a briefing", async () => {
    expect(await invoke(consultation)).toEqual({
      status: 200, payload: { ok: true, code: "BRIEFING_NOT_FOUND" },
    });
  });

  it("returns only the ambiguous result when more than one briefing matches", async () => {
    mocks.limit.mockResolvedValue({ data: [
      { draft: storedDraft, cancelled_at: null, os_id: null },
      { draft: { ...storedDraft, clientName: "Outro registro de teste" }, cancelled_at: null, os_id: null },
    ], error: null });
    expect(await invoke(consultation)).toEqual({
      status: 200, payload: { ok: true, code: "BRIEFING_AMBIGUOUS" },
    });
  });

  it("rejects direct consultation without manager access or with an injected briefing id", async () => {
    expect((await invoke(consultation, "")).status).toBe(401);
    mocks.profile.mockResolvedValue({ data: { role: "consultor_vendas" }, error: null });
    expect((await invoke(consultation)).status).toBe(403);
    expect((await invoke({ ...consultation, historyBefore: 2 })).status).toBe(403);
    mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
    mocks.access.mockResolvedValueOnce({ data: false, error: null });
    expect((await invoke(consultation)).status).toBe(403);
    expect((await invoke({ ...consultation, briefingId: "other" })).status).toBe(400);
    expect(mocks.getContact).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it.each([{ id: "different" }, { contactId: "different" }, { isOpen: false }])(
    "rejects a changed ticket before any briefing read (%j)", async change => {
      mocks.getTicket.mockResolvedValue({ id: "t-1", contactId: "c-1", userId: "u-1", isOpen: true, ...change });
      expect(await invoke(consultation)).toEqual({
        status: 422, payload: { ok: false, code: "CONTEXT_NOT_VERIFIED" },
      });
      expect(mocks.limit).not.toHaveBeenCalled();
    }
  );

  it("tells a read failure apart from a genuine no-match result", async () => {
    mocks.limit.mockResolvedValue({ data: null, error: { message: "private database details" } });
    expect(await invoke(consultation)).toEqual({
      status: 503, payload: { ok: false, code: "SERVER_UNAVAILABLE" },
    });
  });
});
