import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderComment } from "../types/orderDetail";
import { OrderCommentsTab, attemptCommentAction } from "./OrderCommentsTab";

const source = readFileSync(new URL("./OrderCommentsTab.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");
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
  loading?: boolean; error?: string | null; withRetry?: boolean;
} = {}) => renderToStaticMarkup(
  <OrderCommentsTab
    comments={comments} loading={options.loading ?? false}
    error={options.error ?? null} currentUserId={options.currentUserId ?? "user-1"}
    canComment={options.canComment ?? true} canRemoveAny={options.canRemoveAny ?? false}
    onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()}
    onRetry={options.withRetry ? vi.fn() : undefined}
  />
);

describe("EvoluSystem OS comments", () => {
  it("keeps author, date and full multiline messages legible", () => {
    const html = render();
    for (const expected of ["Equipe de Arte", "Produção", "Confirmar medidas do letreiro.", "Aguardando retorno da equipe.", "Aguardando a aprovação do arquivo."]) {
      expect(html).toContain(expected);
    }
    expect(html).toContain('dateTime="2026-10-14T12:00:00Z"');
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
    expect(render([], { error: "Falha na consulta", withRetry: true })).toContain("Tentar novamente");
    expect(render([])).toContain("Nenhum comentário interno.");
  });

  it("retains original create, edit and remove payloads while preventing duplicate requests", () => {
    for (const expected of [
      "await onCreate(message);",
      "onUpdate(id, editMessage, editVersion)",
      "onRemove(id)",
      "disabled={busy || !message.trim()}",
      "disabled={busy || !editMessage.trim() || !editVersion}",
      "if (busy || removing?.id !== id) return;",
      "setEditing(comment.id);",
      "setEditMessage(comment.message);",
      "maxLength={4000}",
    ]) expect(source).toContain(expected);
    expect(source).not.toContain("sort(");
  });
});

describe("OS comments — safe action feedback", () => {
  it("resolves successful callbacks and reports no error", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const failure = vi.fn();
    expect(await attemptCommentAction(fn, failure)).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
  });

  it("handles rejected callbacks without an unhandled promise", async () => {
    const failure = vi.fn();
    const result = await attemptCommentAction(() => Promise.reject(new Error("Falha de conexão")), failure);
    expect(result).toBe(false);
    expect(failure).toHaveBeenCalledOnce();
  });

  it("keeps create and edit drafts until their saves have succeeded", () => {
    expect(source).toContain('await onCreate(message);');
    expect(source).toContain('setMessage("");');
    expect(source).toContain('if (saved) { setEditing(null); setEditVersion(null); }');
    expect(source).toContain('failure?.kind === "create"');
    expect(source).toContain('failure?.kind === "update"');
    expect(source).toContain("inFlight.current");
  });

  it("requires removal confirmation and retains it on failure", () => {
    expect(source).toContain('onClick={() => { setFailure(null); setRemoving(comment); }}');
    expect(source).toContain('<AlertDialog open={Boolean(removing)}');
    expect(source).toContain("Confirmar remoção");
    expect(source).toContain('if (removed) setRemoving(null);');
    expect(source).toContain('failure?.kind === "remove"');
    expect(source).toContain('disabled={busy}');
  });

  it("propagates edit and removal errors to the component", () => {
    const remove = page.slice(page.indexOf("const removeComment ="), page.indexOf("const editComment ="));
    const edit = page.slice(page.indexOf("const editComment ="), page.indexOf("const saveOrder ="));
    expect(remove).toContain("throw error;");
    expect(edit).toContain("throw error;");
    expect(page).toContain('onRetry={() => void loadTab("comments")}');
  });

  it("pins the server revision at the instant editing begins", () => {
    expect(source).toContain("setEditVersion(comment.updated_at);");
    expect(source).toContain("editing !== id || !editMessage.trim() || !editVersion");
    expect(source).toContain('onUpdate(id, editMessage, editVersion)');
    expect(source).toContain("if (saved) { setEditing(null); setEditVersion(null); }");
    expect(source).toContain("setEditVersion(null); setFailure(null);");
    expect(page).toContain("updateOrderCommentIfUnchanged(id, text, expectedUpdatedAt)");
  });

  it("preserves an unsaved edited message after a remote update conflict", () => {
    expect(source).toContain('failure?.kind === "update"');
    expect(source).toContain("Seu texto continua aqui");
    expect(source).toContain("if (saved) { setEditing(null); setEditVersion(null); }");
    const saveStart = source.indexOf("const saveComment = async");
    const removeStart = source.indexOf("const removeComment = async", saveStart);
    const handler = source.slice(saveStart, removeStart);
    expect(handler).not.toContain('setEditMessage("")');
    expect(handler).not.toContain("setEditing(null);\n");
  });

  it("preserves the original author and manager action boundaries", () => {
    expect(source).toContain("const canEdit = own;");
    expect(source).toContain("const canRemove = own || canRemoveAny;");
    expect(render([second], { currentUserId: "user-1", canRemoveAny: true })).not.toContain("Editar comentário de Produção");
    expect(render([second], { currentUserId: "user-1", canRemoveAny: true })).toContain("Remover comentário de Produção");
  });
});
