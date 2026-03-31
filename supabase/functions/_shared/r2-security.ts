import { createClient, type User } from 'npm:@supabase/supabase-js';

const HUB_OS_MODULE_KEY = 'hub_os';
const KEY_CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;

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
  | 'server_config'
  | 'unexpected_error';

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
  const headersToCheck = [
    request.headers.get('authorization'),
    request.headers.get('Authorization'),
    request.headers.get('x-forwarded-authorization'),
  ];

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
): Promise<{ user?: User; error?: Response }> => {
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
  try {
    const supabase = getSupabaseAuthClient(token);
    const { data, error } = await supabase.auth.getUser(token);
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
    return { user };
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

export const getR2Bucket = () => Deno.env.get('R2_BUCKET') || 'os-artes';

export const validateR2Key = (
  key: unknown,
  allowedPrefixes = ['os_orders/'],
): { ok: true; value: string } | { ok: false; message: string } => {
  if (typeof key !== 'string') {
    return { ok: false, message: 'A chave do objeto deve ser string.' };
  }

  const value = key.trim();
  if (value.length === 0 || value.length > 1024) {
    return { ok: false, message: 'A chave do objeto é obrigatória e deve ter até 1024 caracteres.' };
  }

  if (value !== key) {
    return { ok: false, message: 'A chave do objeto não pode conter espaços extras no início/fim.' };
  }

  if (!allowedPrefixes.some((prefix) => value.startsWith(prefix))) {
    return { ok: false, message: 'Prefixo de chave não permitido.' };
  }

  if (value.includes('..')) {
    return { ok: false, message: 'A chave do objeto não pode conter ..' };
  }

  if (KEY_CONTROL_CHAR_REGEX.test(value)) {
    return { ok: false, message: 'A chave do objeto contém caracteres de controle inválidos.' };
  }

  if (value.includes('\\') || value.includes('//') || value.endsWith('/') || value.startsWith('/')) {
    return { ok: false, message: 'A chave do objeto possui path malformado.' };
  }

  return { ok: true, value };
};

export const rejectOrIgnoreBucket = (scope: string, providedBucket: unknown) => {
  if (providedBucket === undefined || providedBucket === null || providedBucket === '') {
    return null;
  }

  infoLog(scope, 'ignored_payload_bucket', { hasBucket: true });
  return null;
};
