import { describe, expect, it } from "vitest";
import {
  assertOperationalOsCreate,
  assertOperationalOsEvent,
  assertOperationalOsUpdate,
} from "./financeWriteGuards";
import type { Os, OsEvent } from "./types";

describe("19V-C: financial write barriers in the legacy client (unit)", () => {
  it.each(["payment_status", "quote_total", "quote_id"] as const)(
    "rejects %s on generic OS update, including an undefined value",
    field => {
      expect(() => assertOperationalOsUpdate({
        [field]: undefined,
      } as Partial<Os>)).toThrow("Campos financeiros");
    }
  );

  it("allows production, art, status and other operational updates", () => {
    expect(() => assertOperationalOsUpdate({
      status_arte: "Produzir",
      status_producao: "Em produção",
      updated_at: "2026-10-16T10:00:00Z",
    })).not.toThrow();
    expect(() => assertOperationalOsUpdate({})).not.toThrow();
  });

  it.each([
    { payment_status: "RELEASED" },
    { payment_status: "UNDER_REVIEW" },
    { quote_total: 0 },
    { quote_total: 180 },
    { quote_id: "00000000-0000-4000-8000-000000000005" },
  ] as Array<Partial<Os>>) (
    "rejects financial fields in new legacy OS: %j", payload => {
      expect(() => assertOperationalOsCreate(payload))
        .toThrow("A criação de OS");
    }
  );

  it("allows ordinary legacy OS creation including the PENDING default", () => {
    expect(() => assertOperationalOsCreate({
      customer_name: "Cliente",
      title: "Teste sintético",
      payment_status: "PENDING",
      quote_total: null,
      quote_id: null,
    })).not.toThrow();
    expect(() => assertOperationalOsCreate({
      customer_name: "Cliente",
      title: "Teste sintético",
    })).not.toThrow();
  });

  it("rejects fake submitted events but not operational history", () => {
    expect(() => assertOperationalOsEvent({
      type: "PAYMENT_SUBMITTED",
    } as Partial<OsEvent>)).toThrow("Eventos de pagamento");
    for (const type of [
      "STATUS_CHANGED", "status_arte_changed", "status_producao_changed",
      "sent_to_production", "details_updated",
    ]) {
      expect(() => assertOperationalOsEvent({ type } as Partial<OsEvent>))
        .not.toThrow();
    }
  });
});
