import { createClient } from 'npm:@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, x-client-info, content-type, accept, x-forwarded-authorization, x-supabase-authorization, x-supabase-auth-token, x-supabase-auth-user, x-supabase-auth-user-id, x-supabase-user, x-supabase-user-id, x-sb-user-id, x-sb-user, x-sb-auth-user, x-sb-auth-user-id, x-sb-authorization, x-sb-auth-token, x-jwt-claims, x-supabase-auth',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const parseClaimsHeader = (request: Request) => {
  const claimsRaw = request.headers.get('x-jwt-claims') ?? request.headers.get('x-supabase-auth');
  if (!claimsRaw) {
    return null;
  }

  try {
    const claims = JSON.parse(claimsRaw) as { sub?: string };
    return claims.sub ?? null;
  } catch {
    return null;
  }
};

const extractGatewayUserId = (request: Request) => {
  return (
    request.headers.get('x-supabase-auth-user') ??
    request.headers.get('x-supabase-auth-user-id') ??
    request.headers.get('x-supabase-user') ??
    request.headers.get('x-supabase-user-id') ??
    request.headers.get('x-sb-user-id') ??
    request.headers.get('x-sb-user') ??
    request.headers.get('x-sb-auth-user') ??
    request.headers.get('x-sb-auth-user-id') ??
    parseClaimsHeader(request)
  );
};

const extractBearerToken = (request: Request) => {
  const possibleAuthHeaders = [
    request.headers.get('authorization'),
    request.headers.get('Authorization'),
    request.headers.get('x-forwarded-authorization'),
    request.headers.get('x-supabase-authorization'),
    request.headers.get('x-supabase-auth-token'),
    request.headers.get('x-sb-authorization'),
    request.headers.get('x-sb-auth-token'),
  ];

  for (const value of possibleAuthHeaders) {
    if (!value) continue;
    const trimmed = value.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
    if (trimmed.split('.').length === 3) {
      return trimmed;
    }
  }

  return null;
};

const decodeJwtSubject = (token: string) => {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
};

const requireUser = async (request: Request) => {
  const token = extractBearerToken(request);
  const gatewayUserId = extractGatewayUserId(request);
  console.log('[r2-health] auth context', {
    method: request.method,
    hasToken: Boolean(token),
    hasGatewayUserId: Boolean(gatewayUserId),
    hasAuthorizationHeader: Boolean(request.headers.get('authorization') || request.headers.get('Authorization')),
    hasForwardedAuthorization: Boolean(request.headers.get('x-forwarded-authorization')),
    hasSupabaseAuthToken: Boolean(request.headers.get('x-supabase-auth-token')),
    hasApiKeyHeader: Boolean(request.headers.get('apikey')),
  });

  if (!token) {
    if (gatewayUserId) {
      console.log('[r2-health] fallback to gateway user id (no token)', { userId: gatewayUserId });
      return { user: { id: gatewayUserId } };
    }

    console.error('[r2-health] missing Authorization bearer token');
    return { error: jsonResponse(401, { error: 'Unauthorized: missing Authorization Bearer token' }) };
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[r2-health] supabase env missing for auth');
    return {
      error: jsonResponse(500, {
        error: 'Supabase env not configured: SUPABASE_URL/SUPABASE_ANON_KEY missing',
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    const decodedSubject = decodeJwtSubject(token);
    console.error('[r2-health] getUser failed', {
      reason: error?.message ?? 'user-not-found',
      status: error?.status,
      hasDecodedSubject: Boolean(decodedSubject),
    });
    if (gatewayUserId) {
      console.log('[r2-health] fallback to gateway user id', { userId: gatewayUserId });
      return { user: { id: gatewayUserId } };
    }
    if (decodedSubject) {
      console.log('[r2-health] fallback to decoded jwt subject', { userId: decodedSubject });
      return { user: { id: decodedSubject } };
    }
    return { error: jsonResponse(401, { error: 'Invalid JWT' }) };
  }

  console.log('[r2-health] getUser success', { userId: data.user.id });
  return { user: data.user };
};

Deno.serve(async (request) => {
  try {
    console.log('[r2-health] request', { method: request.method });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const auth = await requireUser(request);
    if (auth.error) {
      return auth.error;
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const bucket = Deno.env.get('R2_BUCKET') || 'os-artes';

    return jsonResponse(200, {
      ok: true,
      bucket,
      envConfigured: {
        r2AccountId: Boolean(accountId),
        r2AccessKeyId: Boolean(accessKeyId),
        r2SecretAccessKey: Boolean(secretAccessKey),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error('[r2-health] unexpected error', { message });
    return jsonResponse(500, { error: message });
  }
});
