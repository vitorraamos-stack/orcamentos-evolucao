import { supabase } from "@/lib/supabase";
import type { DigisacRequest } from "@shared/digisac/context";

export const requestTimeout = 20000;

export const messages: Record<string, string> = {
  UNAUTHENTICATED: "Entre no EvoluSystem em uma aba própria e tente novamente.",
  FORBIDDEN: "O acesso está restrito à gerência com acesso ao Hub OS.",
  INVALID_CONTEXT: "O Digisac não enviou referências válidas.",
  CONTEXT_NOT_VERIFIED: "Não foi possível confirmar que o chamado está aberto e pertence a este contato. Reabra o painel do atendimento no Digisac.",
  DIGISAC_CONFIG: "Confira a configuração da API no servidor.",
  DIGISAC_UNAUTHORIZED: "A API recusou a credencial.",
  DIGISAC_REFERENCE_NOT_FOUND: "A API não encontrou uma das referências recebidas.",
  DIGISAC_RATE_LIMITED: "Limite de consultas atingido. Tente mais tarde.",
  DIGISAC_UNAVAILABLE: "Não foi possível ler uma das respostas do Digisac.",
  SERVER_CONFIG: "Configuração do servidor indisponível.",
  SERVER_UNAVAILABLE: "Não foi possível concluir a operação.",
  SESSION_CHANGED: "Sua sessão do EvoluSystem mudou. Reabra o formulário com a conta atual.",
  BRIEFING_INVALID: "Revise os dados do briefing antes de salvar.",
};

export function readErrorCode(code: unknown) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code)
    ? code : "SERVER_UNAVAILABLE";
}

export async function requestDigisacContext(request: DigisacRequest, signal: AbortSignal, expectedActor?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return { ok: false, body: { code: "UNAUTHENTICATED" } };
  }
  if (expectedActor && data.session.user.id !== expectedActor) {
    return { ok: false, body: { code: "SESSION_CHANGED" } };
  }
  const response = await fetch("/api/digisac-context-check", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });
  const body = await response.json();
  return { ok: response.ok, body };
}
