import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const messages: Record<string, string> = {
  CONNECTED: "API Digisac respondeu com sucesso.",
  DIGISAC_CONFIG: "Confira DIGISAC_API_BASE_URL e DIGISAC_API_TOKEN na Vercel.",
  DIGISAC_UNAUTHORIZED: "O Digisac recusou a credencial. Confira a validade e as permissões do token.",
  DIGISAC_RATE_LIMITED: "Limite de consultas atingido. Tente mais tarde.",
  DIGISAC_UNAVAILABLE: "A API Digisac não retornou uma resposta válida.",
  SERVER_CONFIG: "Configuração do servidor indisponível.",
  SERVER_UNAVAILABLE: "Não foi possível verificar a conexão.",
  UNAUTHENTICATED: "Sessão inválida. Entre novamente.",
  FORBIDDEN: "Acesso ao diagnóstico não autorizado.",
};

export default function DigisacConnectionCheck() {
  const { session, hubPermissions, hasModuleAccess } = useAuth();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  if (!hubPermissions.isManager || !hasModuleAccess("hub_os")) return null;

  const check = async () => {
    if (pending.current || !session?.access_token) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/digisac-connection-check", {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: "Bearer " + session.access_token, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      const ok = response.ok && body?.ok === true && body?.code === "CONNECTED";
      const message = typeof body?.code === "string" &&
        Object.prototype.hasOwnProperty.call(messages, body.code)
        ? messages[body.code] : "Não foi possível verificar a conexão.";
      setResult({ ok, message });
    } catch {
      setResult({ ok: false, message: "Falha na consulta. Confira a conexão e tente novamente." });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <section className="space-y-2 rounded-lg border p-3">
    <h2 className="text-sm font-semibold">Conexão Digisac — gerência</h2>
    <p className="text-xs text-muted-foreground">Verifica a API e a credencial instalada no servidor, sem revelar o token ou dados dos usuários.</p>
    <Button type="button" variant="outline" className="w-full" disabled={busy || !session?.access_token}
      onClick={() => void check()}>{busy ? "Verificando..." : "Testar conexão Digisac"}</Button>
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>
      {result.message}
    </p>}
  </section>;
}
