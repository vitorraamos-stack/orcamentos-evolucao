import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrderComment, UserOption } from "../types/orderDetail";
import { OrderCommentsTab } from "../components/OrderCommentsTab";
import { prependPublishedComment } from "./publishedComment";

const page = readFileSync(new URL("../pages/OrderDetailPage.tsx", import.meta.url), "utf8");
const tab = readFileSync(new URL("../components/OrderCommentsTab.tsx", import.meta.url), "utf8");

const author: UserOption = { id: "user-1", name: "Equipe de Arte", email: "arte@example.com" };
const makeComment = (id: string, userId = author.id): OrderComment => ({
  id, order_id: "os-1", user_id: userId, message: `Mensagem ${id}`,
  created_at: "2026-10-15T12:00:00Z", updated_at: "2026-10-15T12:00:00Z",
  deleted_at: null,
});

describe("EvoluSystem — newly published comments", () => {
  it("shows a confirmed comment first with its author and preserves earlier entries", () => {
    const previous = [makeComment("older"), makeComment("oldest")];
    const published = makeComment("published");
    const result = prependPublishedComment(previous, published, author);
    expect(result.map(comment => comment.id)).toEqual(["published", "older", "oldest"]);
    expect(result[0].user).toEqual(author);
    expect(previous).toHaveLength(2);
    expect(previous[0].id).toBe("older");
    const html = renderToStaticMarkup(
      <OrderCommentsTab
        comments={result} loading={false} error={null}
        currentUserId={author.id} canComment={true} canRemoveAny={false}
        onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()}
      />
    );
    expect(html).toContain("Mensagem published");
    expect(html).toContain("Equipe de Arte");
    expect(html).toContain("Editar comentário de Equipe de Arte");
    expect(html.indexOf("Mensagem published")).toBeLessThan(html.indexOf("Mensagem older"));
  });

  it("does not duplicate an existing row when the same server id is received", () => {
    const existing = [makeComment("same"), makeComment("older")];
    const result = prependPublishedComment(existing, { ...makeComment("same"), message: "Versão confirmada" }, author);
    expect(result.map(comment => comment.id)).toEqual(["same", "older"]);
    expect(result[0].message).toBe("Versão confirmada");
  });

  it("prefers the author provided by the server when available", () => {
    const server = { ...makeComment("confirmed"), user: { ...author, name: "Nome do servidor" } };
    expect(prependPublishedComment([], server, author)[0].user?.name).toBe("Nome do servidor");
    expect(prependPublishedComment([], makeComment("no-author"))[0].user).toBeUndefined();
  });

  it("uses the confirmed insert instead of a closure-dependent reload", () => {
    const createStart = page.indexOf("const createComment = async");
    const nextAction = page.indexOf("const removeComment = async", createStart);
    const handler = page.slice(createStart, nextAction);
    expect(handler).toContain("await createOrderComment(detail.order.id, text)");
    expect(handler).toContain("prependPublishedComment(value.data, created, author)");
    expect(handler).toContain("loaded: true");
    expect(handler).toContain('await event("comment_created", { comment_id: created.id })');
    expect(handler).not.toContain('loadTab("comments")');
    expect(handler).not.toContain("loaded: false");
  });

  it("keeps the editor draft when publication fails instead of clearing it", () => {
    const createStart = page.indexOf("const createComment = async");
    const handler = page.slice(createStart, page.indexOf("const removeComment = async", createStart));
    expect(handler).toContain("toast.error(message(error))");
    expect(handler).toContain("throw error;");
    const submitStart = tab.indexOf("const submitComment = async");
    const submit = tab.slice(submitStart, tab.indexOf("const saveComment = async", submitStart));
    expect(submit).toContain("await onCreate(message);");
    expect(submit.indexOf("await onCreate(message);")).toBeLessThan(submit.indexOf('setMessage("");'));
    expect(submit).toContain("} catch {");
    expect(submit).toContain("setBusy(false)");
    expect(tab).toContain("disabled={busy || !message.trim()}");
  });
});
