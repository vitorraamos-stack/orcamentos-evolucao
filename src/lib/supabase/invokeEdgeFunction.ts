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

const getSessionOrThrow = async (supabase: SupabaseClient) => {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;

  if (error || !session?.access_token) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return session;
};

const buildHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
});

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

export const invokeEdgeFunction = async <T>(
  supabase: SupabaseClient,
  name: string,
  body: unknown
): Promise<T> => {
  const session = await getSessionOrThrow(supabase);
  const headers = buildHeaders(session.access_token);

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
    const message =
      info.status === 401
        ? SESSION_EXPIRED_MESSAGE
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

export { SESSION_EXPIRED_MESSAGE };
