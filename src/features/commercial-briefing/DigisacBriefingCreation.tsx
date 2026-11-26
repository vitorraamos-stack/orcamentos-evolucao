import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { digisacDraftListSchema, type DigisacTicketReference } from "@shared/digisac/context";
import CommercialBriefingPanel from "./CommercialBriefingPanel";
import { BriefingEditor } from "./CommercialBriefingPage";
import { getCommercialBriefing, type PersistedCommercialBriefing } from "./commercialBriefingRepository";
import {
  commercialBriefingDraftSchema, emptyCommercialBriefing, type CommercialBriefingDraft,
} from "./commercialBriefingDomain";
import { messages, readErrorCode, requestDigisacContext, requestTimeout } from "./digisacContextRequest";

function creationError(code: string) {
  return code === "FORBIDDEN"
    ? "Seu perfil precisa de permissão comercial no Hub OS para criar briefings."
    : messages[code];
}

function CreationForm({ refs, actorId, onRefresh }: {
  refs: DigisacTicketReference;
  actorId: string;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(emptyCommercialBriefing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState(false);
  const request = useRef<{ id: string; draft: CommercialBriefingDraft } | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (existing || inFlight.current) return;
    const parsed = commercialBriefingDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(messages.BRIEFING_INVALID);
      return;
    }
    // Retry uncertain responses with the original UUID and draft snapshot.
    const pending = request.current ?? { id: crypto.randomUUID(), draft: parsed.data };
    request.current = pending;
    const controller = new AbortController();
    inFlight.current = controller;
    setSaving(true);
    setError("");
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
      const { ok, body } = await requestDigisacContext({ ...refs, ...pending, action: "create" }, signal, actorId);
      if (controller.signal.aborted) return;
      if (ok && body?.code === "BRIEFING_CREATED") onRefresh();
      else if (ok && body?.code === "BRIEFING_EXISTS") setExisting(true);
      else {
        const code = readErrorCode(body?.code);
        if (code === "BRIEFING_INVALID") request.current = null;
        setError(creationError(code));
      }
    } catch {
      if (!controller.signal.aborted) setError("Não foi possível confirmar o salvamento. Tente novamente com os mesmos dados.");
    } finally {
      if (!controller.signal.aborted) {
        inFlight.current = null;
        setSaving(false);
      }
    }
  };

  return <form className="space-y-4" onSubmit={event => void save(event)}>
    <CommercialBriefingPanel value={draft} onChange={setDraft} readOnly={saving || request.current !== null} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {existing ? <>
      <p role="status" className="text-sm">Já existe um rascunho neste atendimento. Abra o registro salvo para conferir os dados.</p>
      <Button type="button" onClick={onRefresh}>Abrir rascunho existente</Button>
    </> : <Button type="submit" disabled={saving}>
      {saving ? "Salvando..." : request.current ? "Tentar salvar novamente" : "Salvar briefing"}
    </Button>}
  </form>;
}

type DraftPage =
  | { drafts: ReturnType<typeof digisacDraftListSchema.parse>; hasMore: boolean }
  | { error: string };

async function readEditableDraft(id: string, refs: DigisacTicketReference, actorId: string) {
  const row = await getCommercialBriefing(id);
  if (row?.consultantId !== actorId || row.digisacContactId !== refs.contactId ||
      row.digisacTicketId !== refs.ticketId || row.cancelledAt || row.osId) {
    throw new Error("O rascunho não está mais disponível para edição.");
  }
  return row;
}

function DigisacDraftWorkspace({ refs, actorId }: { refs: DigisacTicketReference; actorId: string }) {
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DraftPage | null>(null);
  const [selected, setSelected] = useState<PersistedCommercialBriefing | null>(null);
  const [opening, setOpening] = useState(false);
  const [openingError, setOpeningError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
        const { ok, body } = await requestDigisacContext({ ...refs, action: "prepare_create", offset }, signal, actorId);
        if (controller.signal.aborted) return;
        const drafts = digisacDraftListSchema.safeParse(body?.drafts);
        if (!ok || body?.code !== "BRIEFING_READY" || !drafts.success) {
          setPage({ error: creationError(readErrorCode(body?.code)) });
          return;
        }
        const hasMore = body.hasMore === true;
        if (offset === 0 && drafts.data.length === 1 && !hasMore) {
          const draft = await readEditableDraft(drafts.data[0].id, refs, actorId);
          if (controller.signal.aborted) return;
          setSelected(draft);
        }
        setPage({ drafts: drafts.data, hasMore });
      } catch {
        if (!controller.signal.aborted) setPage({ error: "Não foi possível abrir os rascunhos deste atendimento." });
      }
    };
    void load();
    return () => controller.abort();
  }, [refs, actorId, offset, validationAttempt]);

  const refresh = (nextOffset = 0) => {
    setSelected(null);
    setCreating(false);
    setOpeningError("");
    setPage(null);
    setOffset(nextOffset);
    setValidationAttempt(attempt => attempt + 1);
  };

  const open = async (id: string) => {
    if (opening) return;
    setOpening(true);
    setOpeningError("");
    try {
      setSelected(await readEditableDraft(id, refs, actorId));
    } catch {
      setOpeningError("O rascunho não está mais disponível para edição. Atualize a lista.");
    } finally {
      setOpening(false);
    }
  };

  const hasChoices = page && "drafts" in page && (page.drafts.length > 1 || page.hasMore || offset > 0);

  return <div className="space-y-4">
    <section aria-label="Referências do atendimento" className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="digisac-create-contact">ID do contato Digisac</Label>
        <Input id="digisac-create-contact" value={refs.contactId} readOnly />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="digisac-create-ticket">ID do chamado Digisac</Label>
        <Input id="digisac-create-ticket" value={refs.ticketId} readOnly />
      </div>
    </section>
    {selected ? <BriefingEditor key={selected.id} initial={selected} actorId={actorId} allowCancel={false}
      onBack={hasChoices ? () => setSelected(null) : undefined} backLabel="Rascunhos do atendimento" />
      : !page ? <p role="status" className="text-sm">Buscando rascunhos do atendimento…</p>
      : "error" in page ? <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">{page.error}</p>
        <Button type="button" variant="outline" onClick={() => refresh()}>Revalidar atendimento</Button>
      </div>
      : page.drafts.length > 0 || offset > 0 ? <section aria-label="Rascunhos do atendimento" className="space-y-3">
        <h2 className="text-base font-semibold">Escolha o rascunho para continuar</h2>
        {page.drafts.map(draft => <Button key={draft.id} variant="outline" disabled={opening}
          className="h-auto w-full flex-col items-start whitespace-normal p-3" onClick={() => void open(draft.id)}>
          <span>{draft.client_name?.trim() || "Rascunho sem nome"} · {draft.id.slice(0, 8)}</span>
          <span className="text-xs font-normal text-muted-foreground">{new Date(draft.updated_at).toLocaleString("pt-BR")}</span>
        </Button>)}
        {openingError && <p role="alert" className="text-sm text-destructive">{openingError}</p>}
        <div className="flex flex-wrap gap-2">
          {offset > 0 && <Button type="button" variant="ghost" disabled={opening} onClick={() => refresh(offset - 50)}>Anterior</Button>}
          {page.hasMore && <Button type="button" variant="ghost" disabled={opening} onClick={() => refresh(offset + 50)}>Próxima página</Button>}
          {openingError && <Button type="button" variant="outline" onClick={() => refresh()}>Atualizar lista</Button>}
        </div>
      </section>
      : creating ? <CreationForm refs={refs} actorId={actorId} onRefresh={() => refresh()} />
      : <div className="space-y-2">
        <p className="text-sm">Nenhum rascunho disponível para este atendimento.</p>
        <Button type="button" onClick={() => setCreating(true)}>Criar briefing</Button>
      </div>}
  </div>;
}

export default function DigisacBriefingWorkspace({ refs }: { refs: DigisacTicketReference | null }) {
  const [actorId, setActorId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setActorId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return <main className="mx-auto min-h-screen w-full max-w-xl space-y-4 bg-background p-4 text-foreground">
    <h1 className="text-xl font-semibold">Briefing Comercial</h1>
    {!refs ? <p role="alert" className="text-sm">{messages.INVALID_CONTEXT}</p>
      : actorId === undefined ? <p role="status" className="text-sm">Verificando sessão do EvoluSystem…</p>
      : actorId ? <DigisacDraftWorkspace key={actorId} actorId={actorId} refs={refs} />
      : <div className="space-y-2">
        <p className="text-sm">Entre com sua conta do EvoluSystem e volte a esta aba para abrir o briefing.</p>
        <a href="/login" target="_blank" rel="noopener noreferrer" className="text-sm underline">Entrar no EvoluSystem</a>
      </div>}
  </main>;
}
