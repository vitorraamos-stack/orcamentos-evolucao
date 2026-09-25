import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderComment } from "../types/orderDetail";
export function OrderCommentsTab({ comments, loading, error, currentUserId, onCreate, onRemove }: { comments: OrderComment[]; loading: boolean; error: string | null; currentUserId?: string; onCreate: (message: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [message, setMessage] = useState("");
  if (loading) return <p className="text-sm text-muted-foreground">Carregando comentários…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return <div className="space-y-4"><div className="space-y-2"><Textarea value={message} maxLength={4000} onChange={e => setMessage(e.target.value)} placeholder="Adicionar comentário interno…" /><div className="flex justify-end"><Button disabled={!message.trim()} onClick={async () => { await onCreate(message); setMessage(""); }}>Comentar</Button></div></div>{!comments.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum comentário interno.</p> : comments.map(comment => <article key={comment.id} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><div><strong className="text-sm">{comment.user?.name ?? "Usuário"}</strong><time className="ml-2 text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time></div>{comment.user_id === currentUserId && <Button size="sm" variant="ghost" onClick={() => onRemove(comment.id)}>Remover</Button>}</div><p className="mt-3 whitespace-pre-wrap text-sm">{comment.message}</p></article>)}</div>;
}

