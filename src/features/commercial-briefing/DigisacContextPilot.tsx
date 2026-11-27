import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  canConsultDigisacBriefing, contextChecks, contextDiagnosticSchema,
  digisacBriefingStates, digisacContextSchema, readDigisacContext, readDigisacTicketReference,
  type ContextDiagnostic, type DigisacContext, type DigisacTicketReference,
} from "@shared/digisac/context";
import CommercialBriefingPanel from "./CommercialBriefingPanel";
import DigisacBriefingWorkspace from "./DigisacBriefingCreation";
import { commercialBriefingDraftSchema } from "./commercialBriefingDomain";
import { messages, readErrorCode, requestDigisacContext, requestTimeout } from "./digisacContextRequest";
const labels: Record<typeof contextChecks[number], string> = {
  contactId: "Contato encontrado e ID confere",
  ticketId: "Chamado encontrado e ID confere",
  ticketContact: "Chamado pertence ao contato",
  ticketOpen: "Chamado aberto",
  ticketAssignee: "Responsável do chamado confere",
  userId: "Usuário encontrado e ID confere",
  accountEmail: "E-mail coincide com a conta EvoluSystem",
  contactName: "Nome disponível na resposta",
  contactPhone: "Telefone disponível na resposta",
};

const resultMessage = "evolusystem:digisac-context-result";
const readyMessage = "evolusystem:digisac-context-ready";
const requestMessage = "evolusystem:digisac-context-request";
const popupTimeout = 45000;
const consultationFragment = "#consultar?";
const creationFragment = "#criar?";
type DiagnosticResult = { checks: ContextDiagnostic } | { code: string };

async function runDiagnostic(refs: DigisacContext, signal: AbortSignal): Promise<DiagnosticResult> {
  try {
    const { ok, body } = await requestDigisacContext(refs, signal);
    const parsed = contextDiagnosticSchema.safeParse(body?.checks);
    if (ok && body?.code === "CONTEXT_INSPECTED" && parsed.success) {
      return { checks: parsed.data };
    }
    return { code: readErrorCode(body?.code) };
  } catch {
    return { code: "SERVER_UNAVAILABLE" };
  }
}

const briefingSchema = z.strictObject({
  draft: commercialBriefingDraftSchema,
  state: z.enum(digisacBriefingStates),
});
const briefingRevisionSchema = z.number().int().positive();
const briefingSaveTimestampSchema = z.iso.datetime({ offset: true }).nullable();
const briefingSaveTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const briefingStateLabels = {
  draft: "Em preenchimento",
  linked: "Vinculado à OS",
  cancelled: "Cancelado",
};
type ConsultationResult =
  | { kind: "found"; briefing: z.infer<typeof briefingSchema>; revision: number; lastSavedAt: string | null }
  | { kind: "none" | "multiple" }
  | { kind: "error"; message: string };

async function consultBriefing(refs: DigisacContext, signal: AbortSignal): Promise<ConsultationResult> {
  try {
    const { ok, body } = await requestDigisacContext({ ...refs, action: "consult" }, signal);
    if (!ok) return { kind: "error", message: messages[readErrorCode(body?.code)] };
    if (body?.code === "BRIEFING_NOT_FOUND") return { kind: "none" };
    if (body?.code === "BRIEFING_AMBIGUOUS") return { kind: "multiple" };
    const parsed = briefingSchema.safeParse(body?.briefing);
    const revision = briefingRevisionSchema.safeParse(body?.revision);
    if (body?.code === "BRIEFING_FOUND" && parsed.success && revision.success) {
      const timestamp = briefingSaveTimestampSchema.safeParse(body?.lastSavedAt);
      return { kind: "found", briefing: parsed.data, revision: revision.data, lastSavedAt: timestamp.data ?? null };
    }
  } catch {
    // Use the same message for network and malformed server responses.
  }
  return { kind: "error", message: "Não foi possível consultar o briefing comercial." };
}

export function BriefingConsultationResult({ result }: { result: ConsultationResult }) {
  switch (result.kind) {
    case "error":
      return <p role="alert" className="text-sm text-destructive">{result.message}</p>;
    case "none":
      return <p role="status" className="text-sm">Nenhum briefing encontrado para este contato.</p>;
    case "multiple":
      return <p role="status" className="text-sm">Mais de um briefing encontrado para este contato. Nenhum foi aberto.</p>;
    case "found":
      return <section className="space-y-4" aria-label="Briefing encontrado">
        <div role="status" className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>Briefing encontrado · {briefingStateLabels[result.briefing.state]}</span>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">Revisão {result.revision}</span>
            <span className="text-muted-foreground">
              Último salvamento{" "}
              {result.lastSavedAt
                ? <time dateTime={result.lastSavedAt}>{briefingSaveTimeFormat.format(new Date(result.lastSavedAt))}</time>
                : "indisponível"}
            </span>
          </div>
        </div>
        <CommercialBriefingPanel value={result.briefing.draft} readOnly />
      </section>;
  }
}

function BriefingConsultation({ refs }: { refs: DigisacContext | null }) {
  const [result, setResult] = useState<ConsultationResult | null>(null);
  useEffect(() => {
    if (!refs) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
    void consultBriefing(refs, signal).then(outcome => {
      if (!controller.signal.aborted) setResult(outcome);
    });
    return () => controller.abort();
  }, [refs]);

  return <main className="mx-auto min-h-screen w-full max-w-xl space-y-4 bg-background p-4 text-foreground">
    <header>
      <h1 className="text-xl font-semibold">Briefing Comercial</h1>
      <p className="text-sm text-muted-foreground">Consulta pelo Digisac · Somente leitura</p>
    </header>
    {!refs ? <p role="alert" className="text-sm">{messages.INVALID_CONTEXT}</p>
      : result ? <BriefingConsultationResult result={result} />
      : <p role="status" className="text-sm">Consultando briefing…</p>}
  </main>;
}

function briefingHref(fragment: string, refs: DigisacTicketReference | DigisacContext) {
  const params = new URLSearchParams({
    contact_id: refs.contactId,
    ticket_id: refs.ticketId,
  });
  if ("userId" in refs) params.set("user_id", refs.userId);
  return window.location.pathname + fragment + params.toString();
}

function DiagnosticSessionWindow({ nonce }: { nonce: string }) {
  const [finished, setFinished] = useState(false);
  const [connected] = useState(() => Boolean(window.opener));

  useEffect(() => {
    const opener = window.opener;
    if (!opener) return;
    const controller = new AbortController();
    const origin = window.location.origin;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== opener ||
          event.data?.type !== requestMessage || event.data?.nonce !== nonce) return;
      const parsed = digisacContextSchema.safeParse(event.data.refs);
      if (!parsed.success) return;
      window.removeEventListener("message", receive);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
      void runDiagnostic(parsed.data, signal).then(result => {
        if (controller.signal.aborted) return;
        // Only diagnostic booleans or a known error code reach the opening panel.
        opener.postMessage({ type: resultMessage, nonce, result }, origin);
        setFinished(true);
      });
    };
    window.addEventListener("message", receive);
    opener.postMessage({ type: readyMessage, nonce }, origin);
    return () => {
      controller.abort();
      window.removeEventListener("message", receive);
    };
  }, [nonce]);

  return <main className="mx-auto max-w-lg space-y-2 p-4">
    <h1 className="text-lg font-semibold">Briefing Comercial</h1>
    <p role="status" className="text-sm">
      {!connected ? "Volte ao Digisac e reabra o diagnóstico pelo painel."
        : finished ? "Volte ao painel do Digisac para ver o resultado."
        : "Validando com a sessão do EvoluSystem…"}
    </p>
  </main>;
}

function DiagnosticPanel({ refs, ticketRefs, inFrame }: {
  refs: DigisacContext | null;
  ticketRefs: DigisacTicketReference | null;
  inFrame: boolean;
}) {
  const [checks, setChecks] = useState<ContextDiagnostic | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const finish = (result: DiagnosticResult) => {
    cancel.current?.();
    cancel.current = null;
    setBusy(false);
    if ("checks" in result) setChecks(result.checks);
    else setError(messages[result.code]);
  };

  const check = async () => {
    if (!refs || cancel.current) return;
    setBusy(true);
    setError("");
    setChecks(null);

    if (!inFrame) {
      const controller = new AbortController();
      cancel.current = () => controller.abort();
      const result = await runDiagnostic(refs, AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]));
      if (!controller.signal.aborted) finish(result);
      return;
    }

    // Open synchronously from the click so Chrome can use the first-party session.
    const nonce = crypto.randomUUID();
    const popupUrl = new URL(window.location.pathname, window.location.origin);
    popupUrl.hash = "sessao=" + nonce;
    const popup = window.open(popupUrl, "_blank", "popup,width=480,height=320");
    if (!popup) {
      setBusy(false);
      setError("O navegador bloqueou a janela de validação. Permita a abertura ou use o diagnóstico em nova aba.");
      return;
    }

    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup ||
          event.data?.nonce !== nonce) return;
      if (event.data?.type === readyMessage) {
        popup.postMessage({ type: requestMessage, nonce, refs }, window.location.origin);
        return;
      }
      if (event.data?.type !== resultMessage) return;
      const parsed = contextDiagnosticSchema.safeParse(event.data.result?.checks);
      finish(parsed.success ? { checks: parsed.data } : { code: readErrorCode(event.data.result?.code) });
    };
    window.addEventListener("message", receive);
    const deadline = window.setTimeout(() => finish({ code: "SERVER_UNAVAILABLE" }), popupTimeout);
    const checkClosed = window.setInterval(() => {
      if (popup.closed) finish({ code: "SERVER_UNAVAILABLE" });
    }, 500);
    cancel.current = () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(deadline);
      window.clearInterval(checkClosed);
      popup.close();
    };
  };

  return <main className="mx-auto w-full max-w-lg min-h-screen min-w-0 space-y-4 bg-background p-4 text-foreground">
    <header className="space-y-1">
      <h1 className="text-lg font-semibold">Briefing Comercial</h1>
      <p className="text-xs text-muted-foreground">EvoluSystem · Atendimento Digisac</p>
    </header>
    {ticketRefs && <a
      href={briefingHref(creationFragment, ticketRefs)} target="_blank" rel="noopener noreferrer"
      className={buttonVariants({ className: "w-full" })}>
      Abrir briefing no EvoluSystem
    </a>}
    <section className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-semibold">Diagnóstico e consulta — gerência</h2>
      <p className="text-xs text-muted-foreground">Painel somente leitura. O formulário abre em outra aba do EvoluSystem.</p>
      <p className="text-sm">{inFrame ? "Aberto em iframe" : "Aberto em nova aba"}</p>
      <p role="status" className={refs ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
        {refs ? "Três identificadores recebidos." : "Referências incompletas ou inválidas. Abra pelo menu do atendimento Digisac."}
      </p>
      <Button type="button" variant="outline" className="w-full" disabled={!refs || busy} onClick={() => void check()}>
        {busy ? "Verificando..." : "Validar contexto do atendimento"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
    {checks && <section className="space-y-2 rounded-lg border p-3" aria-label="Resultado do diagnóstico">
      <h2 className="text-sm font-semibold">Resultado</h2>
      {contextChecks.map(key => <div key={key} className="flex flex-wrap justify-between gap-1 text-xs">
        <span>{labels[key]}</span>
        <span className={checks[key] === true ? "text-emerald-600" : checks[key] === false ? "text-destructive" : "text-muted-foreground"}>
          {checks[key] === true ? "Sim" : checks[key] === false ? "Não" : "Não identificado"}
        </span>
      </div>)}
      <p className="text-xs text-muted-foreground">A comparação de e-mails é informativa.</p>
      {refs && canConsultDigisacBriefing(checks) && <a
        href={briefingHref(consultationFragment, refs)} target="_blank" rel="noopener noreferrer"
        className={buttonVariants({ className: "w-full" })}>
        Consultar briefing
      </a>}
    </section>}
    <div className="space-y-2 text-xs">
      <a href="/login" target="_blank" rel="noopener noreferrer" className="block underline">Entrar no EvoluSystem em uma aba própria</a>
      {inFrame && refs && <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="block underline">Abrir este diagnóstico em nova aba</a>}
    </div>
  </main>;
}

export default function DigisacContextPilot() {
  const [refs] = useState(() => readDigisacContext(window.location.search));
  const [ticketRefs] = useState(() => readDigisacTicketReference(window.location.search));
  const [creation] = useState(() => window.location.hash.startsWith(creationFragment)
    ? { refs: readDigisacTicketReference(window.location.hash.slice(creationFragment.length)) }
    : null);
  const [consultation] = useState(() => window.location.hash.startsWith(consultationFragment)
    ? { refs: readDigisacContext(window.location.hash.slice(consultationFragment.length)) }
    : null);
  const inFrame = window.top !== window.self;
  const nonce = /^#sessao=([0-9a-f-]{36})$/.exec(window.location.hash)?.[1];
  if (!inFrame && nonce) return <DiagnosticSessionWindow nonce={nonce} />;
  if (!inFrame && consultation) return <BriefingConsultation refs={consultation.refs} />;
  if (!inFrame && creation) return <DigisacBriefingWorkspace refs={creation.refs} />;
  return <DiagnosticPanel refs={refs} ticketRefs={ticketRefs} inFrame={inFrame} />;
}
