import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { readDigisacContext, contextChecks, contextDiagnosticSchema, digisacContextSchema, type ContextDiagnostic, type DigisacContext } from "@shared/digisac/context";

const messages: Record<string, string> = {
  UNAUTHENTICATED: "Entre no EvoluSystem em uma aba própria e tente validar novamente.",
  FORBIDDEN: "O diagnóstico está restrito à gerência com acesso ao Hub OS.",
  INVALID_CONTEXT: "O Digisac não enviou referências válidas.",
  DIGISAC_CONFIG: "Confira a configuração da API no servidor.",
  DIGISAC_UNAUTHORIZED: "A API recusou a credencial.",
  DIGISAC_REFERENCE_NOT_FOUND: "A API não encontrou uma das referências recebidas.",
  DIGISAC_RATE_LIMITED: "Limite de consultas atingido. Tente mais tarde.",
  DIGISAC_UNAVAILABLE: "Não foi possível ler uma das respostas do Digisac.",
  SERVER_CONFIG: "Configuração do servidor indisponível.",
  SERVER_UNAVAILABLE: "Não foi possível realizar a verificação.",
};
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
const requestTimeout = 20000;
const popupTimeout = 45000;
type DiagnosticResult = { checks: ContextDiagnostic } | { code: string };

async function runDiagnostic(refs: DigisacContext, signal: AbortSignal): Promise<DiagnosticResult> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return { code: "UNAUTHENTICATED" };

    const response = await fetch("/api/digisac-context-check", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + data.session.access_token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(refs),
      signal,
    });
    const body = await response.json();
    const parsed = contextDiagnosticSchema.safeParse(body?.checks);
    if (response.ok && body?.code === "CONTEXT_INSPECTED" && parsed.success) {
      return { checks: parsed.data };
    }
    return { code: readErrorCode(body?.code) };
  } catch {
    return { code: "SERVER_UNAVAILABLE" };
  }
}

function readErrorCode(code: unknown) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code)
    ? code : "SERVER_UNAVAILABLE";
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

function DiagnosticPanel({ refs, inFrame }: { refs: DigisacContext | null; inFrame: boolean }) {
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
      <p className="text-xs text-muted-foreground">EvoluSystem · Diagnóstico de integração</p>
    </header>
    <section className="space-y-2 rounded-lg border p-3">
      <h2 className="text-sm font-semibold">Teste piloto — gerência</h2>
      <p className="text-xs text-muted-foreground">Nenhuma negociação será criada ou alterada. O painel mostra somente a disponibilidade e correspondência das referências.</p>
      <p className="text-sm">{inFrame ? "Aberto em iframe" : "Aberto em nova aba"}</p>
      <p role="status" className={refs ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
        {refs ? "Três identificadores recebidos." : "Referências incompletas ou inválidas. Abra pelo menu do atendimento Digisac."}
      </p>
      <Button type="button" className="w-full" disabled={!refs || busy} onClick={() => void check()}>
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
      <p className="text-xs text-muted-foreground">Resultado de diagnóstico, não autorização para acessar ou editar briefings.</p>
    </section>}
    <div className="space-y-2 text-xs">
      <a href="/login" target="_blank" rel="noopener noreferrer" className="block underline">Entrar no EvoluSystem em uma aba própria</a>
      {inFrame && refs && <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="block underline">Abrir este diagnóstico em nova aba</a>}
    </div>
  </main>;
}

export default function DigisacContextPilot() {
  const [refs] = useState(() => readDigisacContext(window.location.search));
  const inFrame = window.top !== window.self;
  const nonce = /^#sessao=([0-9a-f-]{36})$/.exec(window.location.hash)?.[1];
  if (!inFrame && nonce) return <DiagnosticSessionWindow nonce={nonce} />;
  return <DiagnosticPanel refs={refs} inFrame={inFrame} />;
}
