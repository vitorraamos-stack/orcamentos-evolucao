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

const extractBearerToken = (request: Request) => {
  const possibleAuthHeaders = [request.headers.get('authorization'), request.headers.get('Authorization')];

  for (const value of possibleAuthHeaders) {
    if (!value) continue;
    const trimmed = value.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
  }

  return null;
};

const requireUser = async (request: Request) => {
  const token = extractBearerToken(request);
  console.log('[r2-health] auth context', {
    method: request.method,
    hasToken: Boolean(token),
    hasAuthorizationHeader: Boolean(request.headers.get('authorization') || request.headers.get('Authorization')),
    hasApiKeyHeader: Boolean(request.headers.get('apikey')),
  });

  if (!token) {
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
    console.error('[r2-health] getUser failed', {
      reason: error?.message ?? 'user-not-found',
      status: error?.status,
    });
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
    const bucket = Deno.env.get('R2_BUCKET');
    if (!bucket) {
      return jsonResponse(500, { error: 'R2_BUCKET não configurado.' });
    }

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
