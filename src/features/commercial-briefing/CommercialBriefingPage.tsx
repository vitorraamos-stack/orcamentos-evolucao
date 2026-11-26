import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ClipboardList, Plus, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { installOrderDraftNavigationGuard } from "@/modules/orders/services/orderNavigationGuard";
import CommercialBriefingPanel from "./CommercialBriefingPanel";
import { emptyCommercialBriefing } from "./commercialBriefingDomain";
import {
  cancelCommercialBriefing,
  CommercialBriefingRepositoryError,
  createCommercialBriefing,
  getCommercialBriefing,
  listCommercialBriefings,
  type PersistedCommercialBriefing,
} from "./commercialBriefingRepository";
import { useCommercialBriefingAutosave } from "./useCommercialBriefingAutosave";

const EXIT_MESSAGE = "Existem alterações do briefing ainda não salvas. Sair mesmo assim?";
const saveLabels = {
  saved: "Salvo no EvoluSystem",
  pending: "Alterações pendentes",
  saving: "Salvando...",
  error: "Falha no salvamento",
  conflict: "Conflito de revisão",
  reloading: "Recarregando...",
} as const;
const safeError = (cause: unknown) => cause instanceof CommercialBriefingRepositoryError
  ? cause.message : "Não foi possível concluir a operação. Tente novamente.";

function BriefingEditor({ initial, actorId, onBack }: {
  initial: PersistedCommercialBriefing;
  actorId: string;
  onBack: () => void;
}) {
  const editor = useCommercialBriefingAutosave(initial, actorId);
  const { record, draft, editable, dirty, status } = editor;
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const cancelInFlight = useRef(false);
  const busy = status === "saving" || status === "reloading" || cancelling;
  const needsGuard = dirty || busy;
  useEffect(() => {
    if (!needsGuard) return;
    return installOrderDraftNavigationGuard(window, () => window.confirm(EXIT_MESSAGE));
  }, [needsGuard]);

  const back = () => {
    if (busy) return;
    if (!dirty || window.confirm(EXIT_MESSAGE)) onBack();
  };
  const cancel = async () => {
    if (!editable || dirty || busy || status !== "saved" || cancelInFlight.current) return;
    if (!window.confirm("Cancelar esta negociação? O histórico será preservado e o briefing não poderá ser editado.")) return;
    cancelInFlight.current = true;
    setCancelling(true);
    setCancelError("");
    try {
      await cancelCommercialBriefing({ id: record.id, expectedRevision: record.revision });
      onBack();
    } catch (cause) {
      setCancelError(safeError(cause));
    } finally {
      cancelInFlight.current = false;
      setCancelling(false);
    }
  };

  return <div className="min-w-0 space-y-4">
    <Button type="button" variant="ghost" className="-ml-2" disabled={busy} onClick={back}>
      <ArrowLeft /> Negociações
    </Button>
    <header className="space-y-1 rounded-xl bg-[#1C2935] p-3 text-white">
      <h2 className="break-words text-base font-semibold">{draft.clientName.trim() || "Nova negociação"}</h2>
      <p className="break-all text-xs text-white/75">Briefing {record.id.slice(0, 8)} · revisão {record.revision}</p>
    </header>
    <div className="rounded-lg border bg-card p-3 text-xs space-y-1">
      <p className="break-all"><strong>Contato informado:</strong> {record.digisacContactId}</p>
      {record.digisacTicketId && <p className="break-all"><strong>Chamado informado:</strong> {record.digisacTicketId}</p>}
      <p className="text-muted-foreground">{record.contextVerifiedAt ? "Contexto verificado" : "Referência manual — não verificada pelo Digisac."}</p>
    </div>
    {!editable && <p className="rounded-lg border p-3 text-sm text-muted-foreground">
      {record.cancelledAt ? "Negociação cancelada." : record.osId ? "Negociação vinculada a uma OS." : "Negociação de outra consultora."} Somente leitura.
    </p>}
    <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
      <span className={status === "error" || status === "conflict" ? "text-destructive" : "text-muted-foreground"}>
        {saveLabels[status]}
      </span>
      {editable && <Button type="button" size="sm" variant="outline" disabled={busy || !dirty || status === "conflict"} onClick={() => void editor.save()}>
        Salvar agora
      </Button>}
    </div>
    {editor.error && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm">
      <p>{editor.error}</p>
      <p className="text-muted-foreground">Sua edição permanece neste painel. Não será feita uma sobrescrita automática.</p>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => {
        if (!dirty || window.confirm("Recarregar a versão do servidor e descartar as alterações locais não salvas?"))
          void editor.reload();
      }}><RefreshCw /> Recarregar versão salva</Button>
    </div>}
    <CommercialBriefingPanel value={draft} onChange={editor.edit}
      readOnly={!editable || status === "reloading" || cancelling}
      saved={!dirty && status === "saved" && !record.cancelledAt} />
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">Salvamento automático ativo quando houver alterações. Nenhum briefing inicia a contagem do prazo da OS.</p>
      {editable && <Button type="button" size="sm" variant="ghost" className="text-destructive"
        disabled={dirty || busy || status !== "saved"} onClick={() => void cancel()}>
        {cancelling ? "Cancelando..." : "Cancelar negociação"}
      </Button>}
      {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
    </div>
  </div>;
}

function CommercialBriefingWorkspace({ actorId }: { actorId: string }) {
  const [contactInput, setContactInput] = useState("");
  const [contact, setContact] = useState("");
  const [ticket, setTicket] = useState("");
  const [rows, setRows] = useState<PersistedCommercialBriefing[]>([]);
  const [selected, setSelected] = useState<PersistedCommercialBriefing | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  // Preserve an id on retry of the same logical creation request.
  const creation = useRef<{ id: string; contactId: string; ticketId: string | null } | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (cause) { setError(safeError(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const load = async (contactId: string, append = false) => {
    const start = append ? offset : 0;
    const result = await listCommercialBriefings({ contactId, offset: start });
    setRows(current => append
      ? [...current, ...result.filter(row => !current.some(existing => existing.id === row.id))]
      : result);
    setOffset(start + result.length);
    setHasMore(result.length === 50);
    setContact(contactId);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const id = contactInput.trim();
    if (!id || inFlight.current) return;
    setRows([]);
    setContact("");
    setHasMore(false);
    setTicket("");
    // Do not silently abandon a create retry if its result was lost.
    if (creation.current?.contactId !== id) creation.current = null;
    void run(() => load(id));
  };
  const newBriefing = () => {
    if (!contact || contact !== contactInput.trim() || inFlight.current) return;
    const ticketId = ticket.trim() || null;
    const pending = creation.current;
    const request = pending && pending.contactId === contact && pending.ticketId === ticketId
      ? pending : { id: crypto.randomUUID(), contactId: contact, ticketId };
    creation.current = request;
    void run(async () => {
      const result = await createCommercialBriefing({ ...request, draft: emptyCommercialBriefing() });
      creation.current = null;
      setSelected(result);
    });
  };
  const open = (id: string) => void run(async () => {
    const result = await getCommercialBriefing(id);
    if (!result || result.digisacContactId !== contact) throw new CommercialBriefingRepositoryError("forbidden");
    setSelected(result);
  });
  const back = () => {
    setSelected(null);
    setRows([]);
    setHasMore(false);
    if (contact) void run(() => load(contact));
  };

  return <main className="mx-auto w-full max-w-xl min-w-0 space-y-4 pb-8">
    <header className="space-y-1">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-5 shrink-0" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Briefing Comercial</h1>
      </div>
      <p className="text-sm text-muted-foreground">Organize as informações do atendimento antes de criar a OS.</p>
    </header>
    {selected ? <BriefingEditor key={selected.id} initial={selected} actorId={actorId} onBack={back} /> :
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <strong>Modo manual</strong>
          <p className="text-xs text-muted-foreground mt-1">Informe o identificador exato do contato no Digisac. A associação automática e a verificação do atendimento ainda não estão habilitadas. Não use o ID de outro cliente.</p>
        </div>
        <form onSubmit={search} className="space-y-2">
          <Label htmlFor="briefing-contact-reference">ID do contato Digisac</Label>
          <Input id="briefing-contact-reference" required maxLength={200} value={contactInput} disabled={busy}
            autoComplete="off" onChange={e => setContactInput(e.target.value)} placeholder="Identificador do contato" />
          <Button type="submit" variant="outline" className="w-full" disabled={busy || !contactInput.trim()}>
            <Search /> {busy ? "Consultando..." : "Consultar negociações"}
          </Button>
        </form>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        {contact && contact === contactInput.trim() &&
          <section className="space-y-3" aria-label="Negociações do contato">
            <div className="rounded-xl border p-3 space-y-2">
              <h2 className="text-sm font-semibold">Nova negociação</h2>
              <Label htmlFor="briefing-ticket-reference">ID do chamado (opcional)</Label>
              <Input id="briefing-ticket-reference" maxLength={200} value={ticket} disabled={busy}
                autoComplete="off" onChange={e => setTicket(e.target.value)} />
              <Button type="button" className="w-full" disabled={busy} onClick={newBriefing}>
                <Plus /> {creation.current ? "Tentar criação novamente" : "Criar briefing"}
              </Button>
              <p className="text-xs text-muted-foreground">Cada negociação possui um registro próprio, mesmo para o mesmo contato.</p>
            </div>
            <h2 className="text-sm font-semibold">Negociações encontradas</h2>
            {!busy && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma negociação visível para este contato.</p>}
            {rows.map(row => (
              <button type="button" key={row.id} disabled={busy} onClick={() => open(row.id)}
                className="w-full min-w-0 rounded-lg border bg-card p-3 text-left hover:bg-muted/40 disabled:opacity-50">
                <span className="block break-words text-sm font-medium">{row.draft.clientName.trim() || "Negociação sem nome"}</span>
                <span className="block text-xs text-muted-foreground">{row.cancelledAt ? "Cancelada" : row.osId ? "Vinculada à OS" : "Em preenchimento"} · {row.id.slice(0, 8)}</span>
                <span className="block text-xs text-muted-foreground">{row.draft.items.length} item(ns) · revisão {row.revision}{row.consultantId !== actorId ? " · somente leitura" : ""}</span>
              </button>
            ))}
            {hasMore && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void run(() => load(contact, true))}>Carregar mais</Button>}
          </section>}
      </div>}
  </main>;
}

export default function CommercialBriefingPage() {
  const { user, hubPermissions, hasModuleAccess } = useAuth();
  if (!user || !hubPermissions.canCreateOs || !hasModuleAccess("hub_os")) {
    return <p role="alert" className="p-3 text-sm">Sem permissão para o Briefing Comercial.</p>;
  }
  // Reset all local edits and references when the authenticated actor changes.
  return <CommercialBriefingWorkspace key={user.id} actorId={user.id} />;
}
