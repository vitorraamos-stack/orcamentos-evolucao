import { useId, useRef, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  onRetry?: () => void;
  onCreate: (message: string) => Promise<void>;
  onUpdate: (id: string, message: string, expectedUpdatedAt: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export async function attemptCommentAction(
  action: () => Promise<void>,
  onFailure: () => void,
): Promise<boolean> {
  try {
    await action();
    return true;
  } catch {
    onFailure();
    return false;
  }
}

const commentDate = (date: string) =>
  new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** The original permissions and callbacks are unchanged; this is a presentation refinement. */
export function OrderCommentsTab({
  comments, loading, error, currentUserId, canComment, canRemoveAny,
  onCreate, onUpdate, onRemove, onRetry,
}: Props) {
  const composeId = useId();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<"create" | "update" | "remove" | null>(null);
  const [failure, setFailure] = useState<{ kind: "create" | "update" | "remove"; id?: string } | null>(null);
  const [removing, setRemoving] = useState<OrderComment | null>(null);
  const inFlight = useRef(false);

  const runAction = async (
    kind: "create" | "update" | "remove",
    action: () => Promise<void>,
    id?: string,
  ) => {
    // The ref prevents a second request before React commits the busy state.
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setPending(kind);
    setFailure(null);
    try {
      return await attemptCommentAction(action, () => setFailure({ kind, id }));
    } finally {
      inFlight.current = false;
      setBusy(false);
      setPending(null);
    }
  };

  const submitComment = async () => {
    if (busy || !canComment || !message.trim()) return;
    await runAction("create", async () => {
      await onCreate(message);
      setMessage("");
    });
  };

  const saveComment = async (id: string) => {
    if (busy || editing !== id || !editMessage.trim() || !editVersion) return;
    const saved = await runAction("update", () => onUpdate(id, editMessage, editVersion), id);
    if (saved) { setEditing(null); setEditVersion(null); }
  };

  const removeComment = async (id: string) => {
    if (busy || removing?.id !== id) return;
    const removed = await runAction("remove", () => onRemove(id), id);
    if (removed) setRemoving(null);
  };

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Carregando comentários…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
    <p className="min-w-0 break-words text-sm text-destructive">Não foi possível carregar os comentários: {error}</p>
    {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Tentar novamente</Button>}
  </div>;

  return (
    <div className="flex flex-col gap-5">
      {canComment && (
        <section aria-label="Novo comentário" className="order-2 space-y-3">
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
          {failure?.kind === "create" && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível publicar o comentário. Seu texto foi preservado; tente novamente.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              className="min-h-11 sm:min-h-9"
              disabled={busy || !message.trim()}
              onClick={() => void submitComment()}
            >
              {pending === "create" ? "Publicando…" : "Comentar"}
            </Button>
          </div>
        </section>
      )}

      {!comments.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum comentário interno.
        </p>
      ) : (
        <div className="order-1 space-y-3" aria-label="Comentários da OS">
          {[...comments].reverse().map(comment => {
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
                          disabled={busy || (editing !== null && editing !== comment.id)}
                          aria-label={`Editar comentário de ${comment.user?.name ?? "Usuário"}`}
                          onClick={() => {
                            setFailure(null);
                            setEditing(comment.id);
                            setEditMessage(comment.message);
                            setEditVersion(comment.updated_at);
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
                          onClick={() => { setFailure(null); setRemoving(comment); }}
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
                    {failure?.kind === "update" && failure.id === comment.id && (
                      <p role="alert" className="text-sm text-destructive">
                        Não foi possível salvar a edição. O comentário pode ter sido alterado por outra pessoa. Seu texto continua aqui; confira a versão atual antes de tentar novamente.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy}
                        onClick={() => { setEditing(null); setEditVersion(null); setFailure(null); }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 sm:min-h-9"
                        disabled={busy || !editMessage.trim() || !editVersion}
                        onClick={() => void saveComment(comment.id)}
                      >
                        {pending === "update" ? "Salvando…" : "Salvar alterações"}
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
      <AlertDialog open={Boolean(removing)} onOpenChange={open => {
        if (!open && !busy) { setRemoving(null); setFailure(null); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover comentário?</AlertDialogTitle>
            <AlertDialogDescription>
              O comentário de {removing?.user?.name ?? "Usuário"} será removido da OS.
              Confirme para continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure?.kind === "remove" && failure.id === removing?.id && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível remover este comentário. Tente novamente.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => removing && void removeComment(removing.id)}>
              {pending === "remove" ? "Removendo…" : "Confirmar remoção"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
