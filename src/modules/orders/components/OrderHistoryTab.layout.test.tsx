import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OrderActivity } from "../types/orderDetail";
import { OrderHistoryTab, formatOrderActivity } from "./OrderHistoryTab";

const source = readFileSync(new URL("./OrderHistoryTab.tsx", import.meta.url), "utf8");
const activity = (overrides: Partial<OrderActivity> = {}): OrderActivity => ({
  id: "event-1", os_id: "os-1", type: "item_created",
  payload: { name: "Letreiro em PVC" }, created_by: "user-1",
  created_at: "2026-10-14T15:35:00Z",
  actor: { id: "user-1", name: "Equipe de Arte", email: null },
  ...overrides,
});
const view = (activities: OrderActivity[], loading = false, error: string | null = null) =>
  renderToStaticMarkup(<OrderHistoryTab activities={activities} loading={loading} error={error} />);

describe("EvoluSystem OS activity timeline", () => {
  it("preserves the chronological order received from the repository", () => {
    const html = view([
      activity({ id: "newer", type: "item_created", payload: {}, created_at: "2026-10-14T17:00:00Z" }),
      activity({ id: "older", type: "comment_created", payload: {}, created_at: "2026-10-13T14:00:00Z" }),
    ]);
    expect(html).toContain('aria-label="Linha do tempo da OS"');
    expect(html).toContain("Item criado");
    expect(html).toContain("Comentário adicionado");
    expect(html.indexOf("Item criado")).toBeLessThan(html.indexOf("Comentário adicionado"));
    expect((html.match(/<li /g) ?? []).length).toBe(2);
    expect(source).not.toContain("activities.sort");
    expect(source).not.toContain("activities.reverse");
  });

  it("displays timestamp, author and event text without truncation", () => {
    const html = view([activity({
      type: "status_change",
      payload: { from: "Em Criação", to: "Para Aprovação" },
    })]);
    expect(html).toContain('dateTime="2026-10-14T15:35:00Z"');
    expect(html).toContain("12:35");
    expect(html).toContain("Registrado por");
    expect(html).toContain("Equipe de Arte");
    expect(html).toContain("OS movida de Em Criação para Para Aprovação");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("overflow-wrap:anywhere");
  });

  it("preserves the fallback for system activity and all events", () => {
    const html = view([activity({
      created_by: null, actor: undefined, type: "ITEM_OPERATION_STATUS_CHANGED",
      payload: { work_center: "PRINTING", to_status: "BLOCKED", blocked_reason: "Falta material" },
    })]);
    expect(html).toContain("Sistema");
    expect(html).toContain("Falta material");
    expect(html).toContain(formatOrderActivity({
      type: "ITEM_OPERATION_STATUS_CHANGED",
      payload: { work_center: "PRINTING", to_status: "BLOCKED", blocked_reason: "Falta material" },
    }));
  });

  it("keeps loading, error and empty states unchanged", () => {
    expect(view([], true)).toContain("Carregando histórico");
    expect(view([], true)).toContain('role="status"');
    expect(view([], false, "Não foi possível obter os eventos")).toContain('role="alert"');
    expect(view([])).toContain("Nenhum evento registrado.");
  });

  it("does not add action controls or replace the event formatter", () => {
    expect(view([activity()])).not.toContain("<button");
    expect(source).toContain("{formatOrderActivity(activity)}");
    expect(source).not.toContain("onClick=");
    expect(source).not.toContain("onRemove");
  });
});
