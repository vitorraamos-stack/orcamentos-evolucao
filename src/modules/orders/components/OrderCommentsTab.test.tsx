import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderComment } from "../types/orderDetail";
import { OrderCommentsTab } from "./OrderCommentsTab";

const source = readFileSync(new URL("./OrderCommentsTab.tsx", import.meta.url), "utf8");
const first: OrderComment = {
  id: "comment-1", order_id: "os-1", user_id: "user-1",
  message: "Confirmar medidas do letreiro.\nAguardando retorno da equipe.",
  created_at: "2026-10-14T12:00:00Z", updated_at: "2026-10-14T12:00:00Z",
  deleted_at: null,
  user: { id: "user-1", name: "Equipe de Arte", email: null },
};
const second: OrderComment = {
  ...first, id: "comment-2", user_id: "user-2",
  message: "Aguardando a aprovação do arquivo.",
  user: { id: "user-2", name: "Produção", email: null },
};
const render = (comments: OrderComment[] = [first, second], options: {
  canComment?: boolean; canRemoveAny?: boolean; currentUserId?: string;
  loading?: boolean; error?: string | null;
} = {}) => renderToStaticMarkup(
  <OrderCommentsTab
    comments={comments} loading={options.loading ?? false}
    error={options.error ?? null} currentUserId={options.currentUserId ?? "user-1"}
    canComment={options.canComment ?? true} canRemoveAny={options.canRemoveAny ?? false}
    onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()}
  />
);

describe("EvoluSystem OS comments", () => {
  it("keeps author, date and full multiline messages legible", () => {
    const html = render();
    for (const expected of ["Equipe de Arte", "Produção", "Confirmar medidas do letreiro.", "Aguardando retorno da equipe.", "Aguardando a aprovação do arquivo."]) {
      expect(html).toContain(expected);
    }
    expect(html).toContain('dateTime="2026-10-14T12:00:00Z"'.replace("dateTime", "dateTime") === "unused" ? "never" : 'dateTime="2026-10-14T12:00:00Z"');
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain('aria-label="Comentários da OS"');
  });

  it("shows writing tools only for users allowed to comment", () => {
    const editor = render();
    expect(editor).toContain("Comentário interno");
    expect(editor).toContain("Comentar");
    expect(editor).toContain('maxLength="4000"');
    const readonly = render([first], { canComment: false, currentUserId: "viewer" });
    expect(readonly).not.toContain("Comentário interno");
    expect(readonly).not.toContain("Comentar</button>");
    expect(readonly).toContain("Confirmar medidas do letreiro.");
  });

  it("keeps edit limited to authors and remove limited to authors or managers", () => {
    const html = render();
    expect(html).toContain("Editar comentário de Equipe de Arte");
    expect(html).toContain("Remover comentário de Equipe de Arte");
    expect(html).not.toContain("Editar comentário de Produção");
    expect(html).not.toContain("Remover comentário de Produção");
    const manager = render([first, second], { canRemoveAny: true });
    expect(manager).toContain("Remover comentário de Produção");
    expect(manager).not.toContain("Editar comentário de Produção");
    const outsider = render([first], { currentUserId: "other", canRemoveAny: false });
    expect(outsider).not.toContain("Editar comentário de Equipe de Arte");
    expect(outsider).not.toContain("Remover comentário de Equipe de Arte");
  });

  it("preserves loading, errors and empty state", () => {
    expect(render([], { loading: true })).toContain('role="status"');
    expect(render([], { error: "Falha na consulta" })).toContain('role="alert"');
    expect(render([])).toContain("Nenhum comentário interno.");
  });

  it("retains original create, edit and remove payloads while preventing duplicate requests", () => {
    for (const expected of [
      "await onCreate(message);",
      "await onUpdate(id, editMessage);",
      "await onRemove(id);",
      "disabled={busy || !message.trim()}",
      "disabled={busy || !editMessage.trim()}",
      "if (busy) return;",
      "setEditing(comment.id);",
      "setEditMessage(comment.message);",
      "maxLength={4000}",
    ]) expect(source).toContain(expected);
    expect(source).not.toContain("sort(");
  });
});
