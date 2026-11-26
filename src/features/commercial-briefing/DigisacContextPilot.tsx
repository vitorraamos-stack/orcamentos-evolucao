import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { readDigisacContext, contextChecks, contextDiagnosticSchema, type ContextDiagnostic } from "@shared/digisac/context";

const messages: Record<string, string> = {
  UNAUTHENTICATED: "Entre no EvoluSystem em uma aba própria e reabra o painel. Se a sessão não for compartilhada pelo navegador, abra o diagnóstico em nova aba.",
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

export default function DigisacContextPilot() {
  const [refs] = useState(() => readDigisacContext(window.location.search));
  const [checks, setChecks] = useState<ContextDiagnostic | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const inFrame = window.top !== window.self;

  const check = async () => {
    if (!refs || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setChecks(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        setError(messages.UNAUTHENTICATED);
        return;
      }
      const response = await fetch("/api/digisac-context-check", {
        method: "POST", cache: "no-store",
        headers: { Authorization: "Bearer " + data.session.access_token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(refs),
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      const parsed = contextDiagnosticSchema.safeParse(body?.checks);
      if (!response.ok || body?.code !== "CONTEXT_INSPECTED" || !parsed.success) {
        const code = body?.code;
        setError(typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code)
          ? messages[code] : "Não foi possível verificar o contexto.");
        return;
      }
      setChecks(parsed.data);
    } catch {
      setError("Falha de conexão ou sessão indisponível. Abra o diagnóstico em nova aba se necessário.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
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
