import { describe, expect, it } from "vitest";
import {
  buildCommercialBriefingOrderPrefill,
  canConfirmCommercialBriefing,
  commercialBriefingDraftSchema,
  COMMERCIAL_BRIEFING_SCHEMA_VERSION,
  emptyCommercialBriefing,
  emptyCommercialBriefingItem,
  getCommercialAgreementKey,
  getCommercialBriefingCompletion,
  hasCommercialAgreementChanged,
  hasCurrentCommercialConfirmation,
  type CommercialBriefingDraft,
  type CommercialBriefingRecord,
} from "./commercialBriefingDomain";
import { DELIVERY_DEADLINE_PRESETS } from "@/features/hubos/deliveryDeadlineConfig";
import {
  createOrderItemInputSchema,
  toCreateOrderItemPayload,
} from "@/features/hubos/createOrderDomain";

const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

const complete = (): CommercialBriefingDraft => ({
  ...emptyCommercialBriefing(),
  saleNumber: "84756",
  clientName: "Cliente Teste",
  artInstructions: "Orientações internas de arte",
  commercialNotes: "Acabamento conforme amostra",
  artDirectionTag: "CRIACAO_ARTE",
  deadlinePreset: "STANDARD_8_12",
  logisticType: "retirada",
  items: [{
    ...emptyCommercialBriefingItem(id),
    name: "Placa em ACM",
    quantity: "2",
    width_cm: "1.2",
    height_cm: "0.8",
    measurement_unit: "m",
    description: "ACM preto e letras brancas",
    notes: "Observação interna do item",
  }],
});

const confirmed = (draft = complete()): CommercialBriefingRecord => ({
  id: "00000000-0000-4000-8000-000000000003",
  consultantId: "00000000-0000-4000-8000-000000000004",
  digisacContactId: "contato-teste",
  digisacTicketId: "chamado-teste",
  schemaVersion: COMMERCIAL_BRIEFING_SCHEMA_VERSION,
  revision: 3,
  commercialRevision: 2,
  draft,
  confirmation: {
    commercialRevision: 2,
    agreementKey: getCommercialAgreementKey(draft),
    confirmedAt: "2026-11-26T18:00:00Z",
    registeredBy: "00000000-0000-4000-8000-000000000004",
    evidenceReference: "mensagem-teste",
  },
  osId: null,
  cancelledAt: null,
  createdAt: "2026-11-26T17:00:00Z",
  updatedAt: "2026-11-26T18:00:00Z",
});

describe("commercial briefing domain", () => {
  it("accepts an empty draft without assuming quantity, deadline or logistics", () => {
    const draft = emptyCommercialBriefing();
    expect(commercialBriefingDraftSchema.safeParse(draft).success).toBe(true);
    expect(emptyCommercialBriefingItem(id).quantity).toBe("");
    expect(Object.values(getCommercialBriefingCompletion(draft)).every(v => !v)).toBe(true);
    expect(canConfirmCommercialBriefing(draft)).toBe(false);
    expect(buildCommercialBriefingOrderPrefill(draft)).toBeNull();
  });

  it("uses every official deadline preset", () => {
    for (const deadlinePreset of DELIVERY_DEADLINE_PRESETS) {
      expect(commercialBriefingDraftSchema.safeParse({
        ...complete(), deadlinePreset,
      }).success).toBe(true);
    }
    expect(commercialBriefingDraftSchema.safeParse({
      ...complete(), deadlinePreset: "invented",
    }).success).toBe(false);
  });

  it("allows multiple items and rejects repeated identifiers", () => {
    const draft = complete();
    const second = { ...draft.items[0], id: secondId };
    expect(commercialBriefingDraftSchema.safeParse({
      ...draft, items: [...draft.items, second],
    }).success).toBe(true);
    expect(commercialBriefingDraftSchema.safeParse({
      ...draft, items: [...draft.items, draft.items[0]],
    }).success).toBe(false);
  });

  it("does not allow caller-supplied ownership or conversion metadata in the draft", () => {
    expect(commercialBriefingDraftSchema.safeParse({
      ...complete(), consultantId: "other", osId: "other",
    }).success).toBe(false);
  });

  it.each(["", "invalid", 0, -1])("saves incomplete quantity %s but blocks confirmation", quantity => {
    const draft = complete();
    draft.items[0].quantity = quantity;
    expect(commercialBriefingDraftSchema.safeParse(draft).success).toBe(true);
    expect(getCommercialBriefingCompletion(draft).items).toBe(false);
    expect(canConfirmCommercialBriefing(draft)).toBe(false);
    expect(buildCommercialBriefingOrderPrefill(draft)).toBeNull();
  });

  it("rejects boolean quantity rather than coercing it", () => {
    const draft = complete();
    expect(commercialBriefingDraftSchema.safeParse({
      ...draft, items: [{ ...draft.items[0], quantity: true }],
    }).success).toBe(false);
  });

  it("requires a real custom date and does not compute standard dates", () => {
    const draft = complete();
    draft.deadlinePreset = "CUSTOM";
    for (const deliveryDate of ["", "2026-02-30", "30/12/2026"]) {
      expect(getCommercialBriefingCompletion({ ...draft, deliveryDate }).deadline).toBe(false);
    }
    expect(buildCommercialBriefingOrderPrefill({
      ...draft, deliveryDate: "2026-12-30",
    })?.deliveryDate).toBe("2026-12-30");
    expect(buildCommercialBriefingOrderPrefill({
      ...complete(), deliveryDate: "2026-12-30",
    })?.deliveryDate).toBe("");
  });

  it("requires explicit logistics and an address for delivery or installation", () => {
    for (const logisticType of [null, "entrega", "instalacao"] as const) {
      expect(getCommercialBriefingCompletion({
        ...complete(), logisticType,
      }).logistics).toBe(false);
    }
    expect(getCommercialBriefingCompletion({
      ...complete(), logisticType: "instalacao", address: "Rua Teste, 10",
    }).logistics).toBe(true);
    expect(getCommercialBriefingCompletion(complete()).logistics).toBe(true);
  });

  it("allows commercial confirmation before the sale number and internal art briefing", () => {
    const draft = { ...complete(), saleNumber: "", artInstructions: "" };
    expect(canConfirmCommercialBriefing(draft)).toBe(true);
    expect(buildCommercialBriefingOrderPrefill(draft)).toBeNull();
  });

  it("prefills existing OS fields and leaves measurement conversion to the OS domain", () => {
    const draft = complete();
    const prefill = buildCommercialBriefingOrderPrefill(draft);
    expect(prefill).toMatchObject({
      saleNumber: "84756",
      clientName: "Cliente Teste",
      deliveryDeadlinePreset: "STANDARD_8_12",
      deliveryDate: "",
      logisticType: "retirada",
      selectedArtDirectionTag: "CRIACAO_ARTE",
      items: [{ measurement_unit: "m", width_cm: "1.2", status: "PENDING", sort_order: 0 }],
    });
    expect(prefill?.description).toContain(draft.artInstructions);
    expect(prefill?.description).toContain(draft.commercialNotes);
    expect(prefill?.items[0]).not.toHaveProperty("id");
    expect(prefill).not.toHaveProperty("delivery_deadline_started_at");
    const item = createOrderItemInputSchema.parse(prefill?.items[0]);
    expect(toCreateOrderItemPayload(item)).toMatchObject({
      width_cm: 120, height_cm: 80, quantity: 2, unit: "un",
    });
  });

  it("invalidates confirmation when an agreed product, logistics or deadline changes", () => {
    const record = confirmed();
    expect(hasCurrentCommercialConfirmation(record)).toBe(true);
    const changed: CommercialBriefingDraft[] = [
      { ...record.draft, items: [{ ...record.draft.items[0], quantity: "3" }] },
      { ...record.draft, items: [{ ...record.draft.items[0], description: "ACM branco" }] },
      { ...record.draft, logisticType: "entrega", address: "Rua Teste, 10" },
      { ...record.draft, deadlinePreset: "FAST_5_8" },
      { ...record.draft, commercialNotes: "Outra condição" },
    ];
    for (const draft of changed) {
      expect(hasCommercialAgreementChanged(record.draft, draft)).toBe(true);
      expect(hasCurrentCommercialConfirmation({ ...record, draft })).toBe(false);
    }
  });

  it("keeps confirmation when only internal information or sale number changes", () => {
    const record = confirmed();
    const draft = {
      ...record.draft,
      saleNumber: "84757",
      isUrgent: true,
      artInstructions: "Nova orientação interna",
      items: [{ ...record.draft.items[0], notes: "Nova nota interna" }],
    };
    expect(hasCommercialAgreementChanged(record.draft, draft)).toBe(false);
    expect(hasCurrentCommercialConfirmation({ ...record, draft, revision: 4 })).toBe(true);
    expect(getCommercialAgreementKey(draft)).not.toContain("Nova orientação interna");
    expect(getCommercialAgreementKey(draft)).not.toContain("Nova nota interna");
  });

  it("requires matching commercial revision and recorded evidence", () => {
    const record = confirmed();
    expect(hasCurrentCommercialConfirmation({
      ...record, commercialRevision: 3,
    })).toBe(false);
    expect(hasCurrentCommercialConfirmation({ ...record, confirmation: null })).toBe(false);
    expect(hasCurrentCommercialConfirmation({
      ...record, confirmation: { ...record.confirmation!, evidenceReference: " " },
    })).toBe(false);
  });
});
