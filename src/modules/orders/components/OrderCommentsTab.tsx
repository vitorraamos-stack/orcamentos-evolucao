import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderComment } from "../types/orderDetail";

type Props = {
  comments: OrderComment[];
  loading: boolean;
  error: string | null;
  currentUserId?: string;
  canComment: boolean;
  canRemoveAny: boolean;
  onCreate: (message: string) => Promise<void>;
  onUpdate: (id: string, message: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

const commentDate = (date: string) =>
  new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** The original permissions and callbacks are unchanged; this is a presentation refinement. */
export function OrderCommentsTab({
  comments, loading, error, currentUserId, canComment, canRemoveAny,
  onCreate, onUpdate, onRemove,
}: Props) {
  const composeId = useId();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submitComment = async () => {
    if (busy || !canComment || !message.trim()) return;
    setBusy(true);
    try {
      await onCreate(message);
      setMessage("");
    } catch {
      // The page displays the error. Keep the draft so the user can retry.
    } finally {
      setBusy(false);
    }
  };

  const saveComment = async (id: string) => {
    if (busy || !editMessage.trim()) return;
    setBusy(true);
    try {
      await onUpdate(id, editMessage);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onRemove(id);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Carregando comentários…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-5">
      {canComment && (
        <section aria-label="Novo comentário" className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={composeId}>Comentário interno</Label>
            <Textarea
              id={composeId}
              value={message}
              maxLength={4000}
              rows={3}
              disabled={busy}
              onChange={event => setMessage(event.target.value)}
              placeholder="Escreva uma atualização para a equipe…"
              className="min-h-24 resize-y"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              className="min-h-11 sm:min-h-9"
              disabled={busy || !message.trim()}
              onClick={() => void submitComment()}
            >
              {busy ? "Aguarde…" : "Comentar"}
            </Button>
          </div>
        </section>
      )}

      {!comments.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum comentário interno.
        </p>
      ) : (
        <div className="space-y-3" aria-label="Comentários da OS">
          {comments.map(comment => {
            const own = comment.user_id === currentUserId;
            const canEdit = own;
            const canRemove = own || canRemoveAny;
            const isEditing = editing === comment.id;
            return (
              <article key={comment.id} className="min-w-0 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <strong className="break-words text-sm font-semibold">
                      {comment.user?.name ?? "Usuário"}
                    </strong>
                    <time className="text-xs text-muted-foreground" dateTime={comment.created_at}>
                      {commentDate(comment.created_at)}
                    </time>
                  </div>
                  {(canEdit || canRemove) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-10 sm:min-h-9"
                          disabled={busy}
                          aria-label={`Editar comentário de ${comment.user?.name ?? "Usuário"}`}
                          onClick={() => {
                            setEditing(comment.id);
                            setEditMessage(comment.message);
                          }}
                        >
                          Editar
                        </Button>
                      )}
                      {canRemove && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-10 text-destructive hover:text-destructive sm:min-h-9"
                          disabled={busy}
                          aria-label={`Remover comentário de ${comment.user?.name ?? "Usuário"}`}
                          onClick={() => void removeComment(comment.id)}
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`edit-comment-${comment.id}`}>Editar comentário</Label>
                      <Textarea
                        id={`edit-comment-${comment.id}`}
                        value={editMessage}
                        maxLength={4000}
                        rows={4}
                        disabled={busy}
                        onChange={event => setEditMessage(event.target.value)}
                        className="min-h-28 resize-y"
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy || !editMessage.trim()}
                        onClick={() => void saveComment(comment.id)}
                      >
                        {busy ? "Salvando…" : "Salvar alterações"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {comment.message}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
