import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import {
  corsHeaders,
  errorLog,
  errorResponse,
  getR2Bucket,
  infoLog,
  jsonResponse,
  rejectOrIgnoreBucket,
  requireAuthenticatedHubOsUser,
  validateR2Key,
} from '../_shared/r2-security.ts';

type PresignPayload = {
  bucket?: string;
  key: string;
  contentType: string;
  sizeBytes: number;
};

const SCOPE = 'r2-presign-upload';
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

Deno.serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Method not allowed.');
    }

    const auth = await requireAuthenticatedHubOsUser(request, SCOPE);
    if (auth.error) return auth.error;

    let payload: PresignPayload;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(400, 'invalid_json', 'JSON inválido no corpo da requisição.');
    }

    const bucketPayloadError = rejectOrIgnoreBucket(SCOPE, payload.bucket);
    if (bucketPayloadError) return bucketPayloadError;

    const keyValidation = validateR2Key(payload.key);
    if (!keyValidation.ok) {
      return errorResponse(400, 'invalid_input', keyValidation.message);
    }

    if (!payload.contentType || !ALLOWED_CONTENT_TYPES.has(payload.contentType)) {
      return errorResponse(400, 'invalid_input', 'Content-Type não permitido.');
    }

    if (!Number.isFinite(payload.sizeBytes) || payload.sizeBytes <= 0 || payload.sizeBytes > MAX_SIZE_BYTES) {
      return errorResponse(400, 'invalid_input', 'Arquivo fora do limite permitido (1 byte até 500MB).');
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID');
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    let bucket: string;
    try {
      bucket = getR2Bucket();
    } catch (error) {
      errorLog(SCOPE, 'r2_bucket_env_missing', { message: error instanceof Error ? error.message : 'unknown' });
      return errorResponse(500, 'server_config', 'Variável R2_BUCKET não configurada.');
    }

    if (!accountId || !accessKeyId || !secretAccessKey) {
      errorLog(SCOPE, 'r2_env_missing');
      return errorResponse(500, 'server_config', 'Variáveis do R2 não configuradas.');
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: keyValidation.value,
      ContentType: payload.contentType,
      ContentLength: payload.sizeBytes,
    });

    const expiresIn = 600;
    const uploadUrl = await getSignedUrl(client, command, { expiresIn });
    infoLog(SCOPE, 'presign_ok', { userId: auth.user?.id, keyPrefix: keyValidation.value.split('/').slice(0, 2).join('/') });

    return jsonResponse(200, {
      ok: true,
      data: {
        uploadUrl,
        publicKey: keyValidation.value,
        bucket,
        expiresIn,
      },
      uploadUrl,
      publicKey: keyValidation.value,
      bucket,
      expiresIn,
    });
  } catch (error) {
    errorLog(SCOPE, 'unexpected_error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return errorResponse(500, 'unexpected_error', 'Erro inesperado ao gerar URL de upload.');
  }
});
