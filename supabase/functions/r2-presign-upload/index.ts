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

const requireUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization') ?? '';
  console.log('[r2-presign-upload] auth header present:', Boolean(authHeader));

  if (!authHeader.startsWith('Bearer ')) {
    console.error('[r2-presign-upload] missing Authorization bearer token');
    return { error: jsonResponse(401, { error: 'Unauthorized: missing Authorization Bearer token' }) };
  }

  const token = authHeader.replace('Bearer ', '').trim();
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
