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

const requireUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: jsonResponse(401, { error: 'Unauthorized' }) };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseKey) {
    return { error: jsonResponse(500, { error: 'Supabase env not configured.' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: jsonResponse(401, { error: 'Unauthorized' }) };
  }

  return { user: data.user };
};

Deno.serve(async (request) => {
  try {
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
      return jsonResponse(500, { error: 'R2 env not configured.' });
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
    return jsonResponse(500, { error: message });
  }
});
