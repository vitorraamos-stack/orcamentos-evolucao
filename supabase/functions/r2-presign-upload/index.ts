import { createClient } from 'npm:@supabase/supabase-js';
import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';

type PresignPayload = {
  bucket?: string;
  key: string;
  contentType: string;
  sizeBytes: number;
};

const MAX_SIZE_BYTES = 500 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/postscript',
  'application/vnd.adobe.illustrator',
  'application/vnd.corel-draw',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

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
    if (!value) continue;
    if (value.startsWith('Bearer ')) {
      return value.replace('Bearer ', '').trim();
    }
    const trimmed = value.trim();
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
  console.log('[r2-presign-upload] auth header present:', Boolean(token));

  if (!token) {
    const gatewayUserId = extractGatewayUserId(request);
    console.log('[r2-presign-upload] gateway user header present:', Boolean(gatewayUserId));

    if (gatewayUserId) {
      return { user: { id: gatewayUserId } };
    }

    console.error('[r2-presign-upload] missing Authorization bearer token');
    return { error: jsonResponse(401, { error: 'Unauthorized: missing Authorization Bearer token' }) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[r2-presign-upload] supabase env missing for auth');
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
    console.error('[r2-presign-upload] getUser failed', {
      reason: error?.message ?? 'user-not-found',
      status: error?.status,
    });
    const gatewayUserId = extractGatewayUserId(request);
    if (gatewayUserId) {
      console.log('[r2-presign-upload] fallback to gateway user id', { userId: gatewayUserId });
      return { user: { id: gatewayUserId } };
    }
    const decodedSubject = decodeJwtSubject(token);
    if (decodedSubject) {
      console.log('[r2-presign-upload] fallback to decoded jwt subject', { userId: decodedSubject });
      return { user: { id: decodedSubject } };
    }
    return { error: jsonResponse(401, { error: 'Invalid JWT' }) };
  }

  console.log('[r2-presign-upload] getUser success', { userId: data.user.id });
  return { user: data.user };
};

Deno.serve(async (request) => {
  try {
    console.log('[r2-presign-upload] request', { method: request.method });

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

    let payload: PresignPayload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body.' });
    }

    const { key, contentType, sizeBytes, bucket } = payload;

    if (!key || !key.startsWith('os_orders/') || key.includes('..')) {
      return jsonResponse(400, { error: 'Invalid object key.' });
    }

    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return jsonResponse(400, { error: 'Content-Type not allowed.' });
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes > MAX_SIZE_BYTES) {
      return jsonResponse(400, { error: 'File exceeds 500MB limit.' });
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const defaultBucket = Deno.env.get('R2_BUCKET') || 'os-artes';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      console.error('[r2-presign-upload] r2 env missing');
      return jsonResponse(500, { error: 'R2 env not configured' });
    }

    const resolvedBucket = bucket || defaultBucket;

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });

    return jsonResponse(200, {
      uploadUrl,
      publicKey: key,
      bucket: resolvedBucket,
      expiresIn: 600,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error('[r2-presign-upload] unexpected error', { message });
    return jsonResponse(500, { error: message });
  }
});
