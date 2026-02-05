import { createClient } from 'npm:@supabase/supabase-js';
import { DeleteObjectsCommand, S3Client } from 'npm:@aws-sdk/client-s3';

type DeletePayload = {
  keys: string[];
  bucket?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    request.headers.get('x-sb-user-id') ??
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
  ];

  for (const value of possibleAuthHeaders) {
    if (value?.startsWith('Bearer ')) {
      return value.replace('Bearer ', '').trim();
    }
  }

  return null;
};

const requireUser = async (request: Request) => {
  const token = extractBearerToken(request);
  console.log('[r2-delete-objects] auth header present:', Boolean(token));

  if (!token) {
    const gatewayUserId = extractGatewayUserId(request);
    console.log('[r2-delete-objects] gateway user header present:', Boolean(gatewayUserId));

    if (gatewayUserId) {
      return { user: { id: gatewayUserId } };
    }

    console.error('[r2-delete-objects] missing Authorization bearer token');
    return { error: jsonResponse(401, { error: 'Unauthorized: missing Authorization Bearer token' }) };
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[r2-delete-objects] supabase env missing for auth');
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
    console.error('[r2-delete-objects] getUser failed', {
      reason: error?.message ?? 'user-not-found',
      status: error?.status,
    });
    return { error: jsonResponse(401, { error: 'Invalid JWT' }) };
  }

  console.log('[r2-delete-objects] getUser success', { userId: data.user.id });
  return { user: data.user };
};

Deno.serve(async (request) => {
  try {
    console.log('[r2-delete-objects] request', { method: request.method });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const auth = await requireUser(request);
    if (auth.error) {
      return auth.error;
    }

    let payload: DeletePayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    const keys = Array.isArray(payload.keys) ? payload.keys.filter(Boolean) : [];
    if (keys.length === 0) {
      return jsonResponse(400, { error: 'No keys provided.' });
    }

    if (keys.some((key) => !key.startsWith('os_orders/') || key.includes('..'))) {
      return jsonResponse(400, { error: 'Invalid object key.' });
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const defaultBucket = Deno.env.get('R2_BUCKET') || 'os-artes';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      console.error('[r2-delete-objects] r2 env missing');
      return jsonResponse(500, { error: 'R2 env not configured' });
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new DeleteObjectsCommand({
      Bucket: payload.bucket || defaultBucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });

    const result = await client.send(command);
    const deletedCount = result.Deleted?.length ?? 0;
    const errors = result.Errors?.map((error) => ({
      key: error.Key,
      code: error.Code,
      message: error.Message,
    })) ?? [];

    return jsonResponse(200, { deleted: deletedCount, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error('[r2-delete-objects] unexpected error', { message });
    return jsonResponse(500, { error: message });
  }
});
