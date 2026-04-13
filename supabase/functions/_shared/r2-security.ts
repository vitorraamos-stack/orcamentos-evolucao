import { createClient, type User } from 'npm:@supabase/supabase-js';
import {
  extractOrderIdFromR2ScopedKey,
  isValidOrderId,
  validateR2ScopedKey,
} from './r2-key-scope.ts';

const HUB_OS_MODULE_KEY = 'hub_os';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, x-client-info, content-type, accept, x-forwarded-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export type ApiErrorCode =
  | 'method_not_allowed'
  | 'invalid_json'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_input'
  | 'object_not_found'
  | 'server_config'
  | 'unexpected_error';

type SupabaseAuthClient = ReturnType<typeof createClient>;

export const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

export const errorResponse = (
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
) =>
  jsonResponse(status, {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });

export const infoLog = (scope: string, event: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({ scope, event, ...(data ?? {}) }));
};

export const errorLog = (scope: string, event: string, data?: Record<string, unknown>) => {
  console.error(JSON.stringify({ scope, event, ...(data ?? {}) }));
};

export const extractBearerToken = (request: Request) => {
  const headersToCheck = [request.headers.get('authorization'), request.headers.get('Authorization')];

  for (const headerValue of headersToCheck) {
    if (!headerValue) continue;
    const match = headerValue.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const getSupabaseAuthClient = (token: string) => {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
};

const getSupabaseServiceClient = () => {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const requireAuthenticatedHubOsUser = async (
  request: Request,
  scope: string,
): Promise<{ user?: User; token?: string; authClient?: SupabaseAuthClient; error?: Response }> => {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      error: errorResponse(
        401,
        'unauthorized',
        'Authorization Bearer token é obrigatório.',
      ),
    };
  }

  let user: User | null = null;
  let authClient: SupabaseAuthClient | null = null;
  try {
    authClient = getSupabaseAuthClient(token);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data?.user) {
      infoLog(scope, 'auth_invalid_token', { reason: error?.message ?? 'user-not-found' });
      return { error: errorResponse(401, 'unauthorized', 'JWT inválido ou expirado.') };
    }
    user = data.user;
  } catch (error) {
    errorLog(scope, 'auth_env_missing', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return {
      error: errorResponse(
        500,
        'server_config',
        'Configuração de autenticação ausente na função.',
      ),
    };
  }

  try {
    const serviceClient = getSupabaseServiceClient();
    const { data, error } = await serviceClient
      .from('user_module_access')
      .select('module_key')
      .eq('user_id', user.id)
      .eq('module_key', HUB_OS_MODULE_KEY)
      .maybeSingle();

    if (error) {
      errorLog(scope, 'module_access_query_error', {
        message: error.message,
        userId: user.id,
      });
      return {
        error: errorResponse(403, 'forbidden', 'Não foi possível validar permissão do módulo Hub OS.'),
      };
    }

    if (!data) {
      return {
        error: errorResponse(403, 'forbidden', 'Usuário sem acesso ao módulo Hub OS.'),
      };
    }

    infoLog(scope, 'auth_ok', { userId: user.id });
    return { user, token, authClient };
  } catch (error) {
    errorLog(scope, 'module_access_env_missing', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return {
      error: errorResponse(
        500,
        'server_config',
        'Configuração de autorização ausente na função.',
      ),
    };
  }
};

export const getR2Bucket = (): string => {
  const bucket = Deno.env.get('R2_BUCKET');
  if (!bucket) {
    throw new Error('Missing required env: R2_BUCKET');
  }
  return bucket;
};

export const validateR2Key = (
  key: unknown,
  allowedPrefixes = ['os_orders/'],
): { ok: true; value: string } | { ok: false; message: string } =>
  validateR2ScopedKey(key, allowedPrefixes);

export const extractOrderIdFromR2Key = (key: string): string => extractOrderIdFromR2ScopedKey(key);

export const authorizeR2OrderScope = async (
  authClient: SupabaseAuthClient,
  orderIds: string[],
): Promise<{ ok: true } | { ok: false; unauthorizedOrderIds: string[] }> => {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter((orderId) => isValidOrderId(orderId))));
  if (uniqueOrderIds.length === 0) {
    return { ok: false, unauthorizedOrderIds: orderIds };
  }

  const { data, error } = await authClient
    .from('os_orders')
    .select('id')
    .in('id', uniqueOrderIds);

  if (error) {
    throw new Error(`order_scope_query_failed:${error.message}`);
  }

  const authorizedIds = new Set((data ?? []).map((row) => row.id as string));
  const unauthorizedOrderIds = uniqueOrderIds.filter((orderId) => !authorizedIds.has(orderId));

  if (unauthorizedOrderIds.length > 0) {
    return { ok: false, unauthorizedOrderIds };
  }

  return { ok: true };
};

export const rejectOrIgnoreBucket = (scope: string, providedBucket: unknown): Response | null => {
  if (providedBucket === undefined || providedBucket === null || providedBucket === '') {
    return null;
  }

  infoLog(scope, 'rejected_payload_bucket', { hasBucket: true });
  return errorResponse(
    400,
    'invalid_input',
    'Não informe bucket no payload. O bucket é definido exclusivamente por configuração do servidor.',
  );
};
