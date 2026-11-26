import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import type { DigisacTicketReference } from "@shared/digisac/context";
import CommercialBriefingPanel from "./CommercialBriefingPanel";
import {
  commercialBriefingDraftSchema, emptyCommercialBriefing, type CommercialBriefingDraft,
} from "./commercialBriefingDomain";
import { messages, readErrorCode, requestDigisacContext, requestTimeout } from "./digisacContextRequest";

function creationError(code: string) {
  return code === "FORBIDDEN"
    ? "Seu perfil precisa de permissão comercial no Hub OS para criar briefings."
    : messages[code];
}

function CreationForm({ refs, actorId }: { refs: DigisacTicketReference; actorId: string }) {
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [context, setContext] = useState<{ ready: boolean; error?: string }>({ ready: false });
  const [draft, setDraft] = useState(emptyCommercialBriefing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const request = useRef<{ id: string; draft: CommercialBriefingDraft } | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
    void requestDigisacContext({ ...refs, action: "prepare_create" }, signal, actorId)
      .then(({ ok, body }) => {
        if (controller.signal.aborted) return;
        setContext(ok && body?.code === "BRIEFING_READY" ? { ready: true }
          : { ready: false, error: creationError(readErrorCode(body?.code)) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setContext({ ready: false, error: messages.SERVER_UNAVAILABLE });
      });
    return () => controller.abort();
  }, [refs, actorId, validationAttempt]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!context.ready || inFlight.current || saved) return;
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
      if (ok && body?.code === "BRIEFING_CREATED") setSaved(true);
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
    {saved ? <div className="space-y-2">
      <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Salvo no EvoluSystem.</p>
      <a href="/briefing-comercial" className="text-sm underline">Abrir Briefing Comercial</a>
    </div> : context.ready ? <form className="space-y-4" onSubmit={event => void save(event)}>
      <CommercialBriefingPanel value={draft} onChange={setDraft} readOnly={saving || request.current !== null} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Salvando..." : request.current ? "Tentar salvar novamente" : "Salvar briefing"}
      </Button>
    </form> : context.error ? <div className="space-y-2">
      <p role="alert" className="text-sm text-destructive">{context.error}</p>
      <Button type="button" variant="outline" onClick={() => {
        setContext({ ready: false });
        setValidationAttempt(attempt => attempt + 1);
      }}>Revalidar atendimento</Button>
    </div> : <p role="status" className="text-sm">Validando atendimento…</p>}
  </div>;
}

export default function DigisacBriefingCreation({ refs }: { refs: DigisacTicketReference | null }) {
  const [actorId, setActorId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setActorId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return <main className="mx-auto min-h-screen w-full max-w-xl space-y-4 bg-background p-4 text-foreground">
    <h1 className="text-xl font-semibold">Criar briefing comercial</h1>
    {!refs ? <p role="alert" className="text-sm">{messages.INVALID_CONTEXT}</p>
      : actorId === undefined ? <p role="status" className="text-sm">Verificando sessão do EvoluSystem…</p>
      : actorId ? <CreationForm key={actorId} actorId={actorId} refs={refs} />
      : <div className="space-y-2">
        <p className="text-sm">Entre com sua conta do EvoluSystem e volte a esta aba para preencher o briefing.</p>
        <a href="/login" target="_blank" rel="noopener noreferrer" className="text-sm underline">Entrar no EvoluSystem</a>
      </div>}
  </main>;
}
