import type { SupabaseClient } from '@supabase/supabase-js';

export class EdgeFunctionInvokeError extends Error {
  functionName: string;
  status?: number;
  details?: string;

  constructor({
    functionName,
    message,
    status,
    details,
  }: {
    functionName: string;
    message: string;
    status?: number;
    details?: string;
  }) {
    super(message);
    this.name = 'EdgeFunctionInvokeError';
    this.functionName = functionName;
    this.status = status;
    this.details = details;
  }
}

const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. Faça login novamente.';
const MISSING_ANON_KEY_MESSAGE =
  'Ambiente Supabase mal configurado: VITE_SUPABASE_ANON_KEY ausente.';
const INVALID_ANON_KEY_MESSAGE =
  'VITE_SUPABASE_ANON_KEY não parece um JWT válido. Use a chave anon/service_role ou desative verify_jwt na Edge Function.';

const getAnonKey = () => {
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (envKey) {
    return envKey;
  }
  if (typeof process !== 'undefined') {
    return process.env.VITE_SUPABASE_ANON_KEY;
  }
  return undefined;
};

const ensureAnonKey = () => {
  const anonKey = getAnonKey();
  if (!anonKey) {
    throw new Error(MISSING_ANON_KEY_MESSAGE);
  }
  if (anonKey.startsWith('sb_publishable_') || anonKey.split('.').length !== 3) {
    throw new Error(INVALID_ANON_KEY_MESSAGE);
  }
  return anonKey;
};

const getSessionOrThrow = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase.auth.getSession();
  let session = data.session;

  if (error || !session?.access_token) {
    const refresh = await supabase.auth.refreshSession();
    session = refresh.data.session;
  }

  if (!session?.access_token) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return session;
};

const buildHeaders = (accessToken: string) => {
  const anonKey = ensureAnonKey();
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey,
  };
};

const extractErrorDetails = async (error: unknown) => {
  let status: number | undefined;
  let details: string | undefined;

  if (error && typeof error === 'object') {
    const errorLike = error as {
      message?: string;
      context?: Response;
      status?: number;
    };

    details = errorLike.message;
    status = errorLike.status;

    if (errorLike.context) {
      status = errorLike.context.status;
      if (!details) {
        try {
          const body = await errorLike.context.clone().json();
          if (body && typeof body.error === 'string') {
            details = body.error;
          }
        } catch {
          // noop
        }
      }
    }
  }

  return { status, details };
};

const describeAuthIssue = (details?: string) => {
  if (!details) {
    return 'Falha de autenticação (missing Authorization ou JWT inválido).';
  }

  if (/missing authorization/i.test(details)) {
    return 'Missing Authorization header.';
  }

  if (/invalid jwt|jwt/i.test(details)) {
    return 'Invalid JWT. Verifique se a chave anon é JWT e se o projeto corresponde.';
  }

  if (/env/i.test(details)) {
    return 'Supabase env missing.';
  }

  if (/project/i.test(details)) {
    return 'Project mismatch ou JWT de outro projeto.';
  }

  return details;
};

export const invokeEdgeFunction = async <T>(
  supabase: SupabaseClient,
  name: string,
  body: unknown
): Promise<T> => {
  const session = await getSessionOrThrow(supabase);

  const invoke = (accessToken: string) =>
    supabase.functions.invoke<T>(name, {
      body,
      headers: buildHeaders(accessToken),
    });

  let { data, error } = await invoke(session.access_token);

  if (error) {
    const info = await extractErrorDetails(error);

    if (info.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshed.session?.access_token;

      if (!refreshError && refreshedToken) {
        const retry = await invoke(refreshedToken);
        data = retry.data;
        error = retry.error;

        if (!error) {
          return data as T;
        }
      }
    }
  }

  if (error) {
    const info = await extractErrorDetails(error);
    const authHint = info.status === 401 ? describeAuthIssue(info.details) : null;
    const message =
      info.status === 401
        ? `${SESSION_EXPIRED_MESSAGE} ${authHint ?? ''}`.trim()
        : `Falha ao invocar ${name} (HTTP ${info.status ?? 'desconhecido'}): ${info.details ?? 'Sem detalhes.'}`;

    console.error('Edge function error', {
      name,
      status: info.status,
      message: info.details ?? message,
    });

    throw new EdgeFunctionInvokeError({
      functionName: name,
      status: info.status,
      details: info.details,
      message,
    });
  }

  return data as T;
};

export { buildHeaders, ensureAnonKey, SESSION_EXPIRED_MESSAGE };
