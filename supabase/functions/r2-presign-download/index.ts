import { GetObjectCommand, HeadObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import {
  authorizeR2OrderScope,
  corsHeaders,
  errorLog,
  errorResponse,
  extractOrderIdFromR2Key,
  getR2Bucket,
  infoLog,
  jsonResponse,
  rejectOrIgnoreBucket,
  requireAuthenticatedHubOsUser,
  validateR2Key,
} from '../_shared/r2-security.ts';

type PresignDownloadPayload = {
  bucket?: string;
  key: string;
  expiresIn?: number;
  filename?: string;
  forPreview?: boolean;
};

const SCOPE = 'r2-presign-download';

const inferContentType = (key: string, filename?: string) => {
  const source = (filename || key).toLowerCase();
  if (source.endsWith('.png')) return 'image/png';
  if (source.endsWith('.jpg') || source.endsWith('.jpeg')) return 'image/jpeg';
  if (source.endsWith('.webp')) return 'image/webp';
  if (source.endsWith('.gif')) return 'image/gif';
  if (source.endsWith('.bmp')) return 'image/bmp';
  if (source.endsWith('.pdf')) return 'application/pdf';
  return null;
};

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
    if (!auth.authClient) {
      return errorResponse(500, 'server_config', 'Cliente de autenticação indisponível.');
    }

    let payload: PresignDownloadPayload;
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
    const orderId = extractOrderIdFromR2Key(keyValidation.value);
    try {
      const scopeCheck = await authorizeR2OrderScope(auth.authClient, [orderId]);
      if (!scopeCheck.ok) {
        infoLog(SCOPE, 'order_scope_forbidden', {
          userId: auth.user?.id,
          unauthorizedOrderIds: scopeCheck.unauthorizedOrderIds,
        });
        return errorResponse(403, 'forbidden', 'Sem permissão para acessar o objeto solicitado.');
      }
    } catch (error) {
      errorLog(SCOPE, 'order_scope_query_error', {
        userId: auth.user?.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return errorResponse(403, 'forbidden', 'Não foi possível validar escopo de acesso ao objeto.');
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

    const resolvedExpiresIn =
      Number.isFinite(payload.expiresIn) && (payload.expiresIn as number) > 0 && (payload.expiresIn as number) <= 3600
        ? (payload.expiresIn as number)
        : 600;

    const responseContentType = inferContentType(keyValidation.value, payload.filename);
    const safeFilename = (payload.filename || keyValidation.value.split('/').pop() || 'arquivo').replace(/[\r\n"]/g, '').trim();

    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: keyValidation.value,
        }),
      );
    } catch (error) {
      const maybeAwsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (maybeAwsError.name === 'NotFound' || maybeAwsError.$metadata?.httpStatusCode === 404) {
        infoLog(SCOPE, 'object_not_found', {
          userId: auth.user?.id,
          orderId,
          key: keyValidation.value,
        });
        return errorResponse(404, 'object_not_found', 'O arquivo solicitado não existe mais no armazenamento.');
      }
      throw error;
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: keyValidation.value,
      ...(payload.forPreview
        ? {
            ResponseContentDisposition: `inline; filename="${safeFilename}"`,
            ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
          }
        : {}),
    });

    const downloadUrl = await getSignedUrl(client, command, { expiresIn: resolvedExpiresIn });
    infoLog(SCOPE, 'presign_ok', {
      userId: auth.user?.id,
      orderId,
      forPreview: Boolean(payload.forPreview),
    });

    return jsonResponse(200, {
      ok: true,
      data: {
        downloadUrl,
        bucket,
        key: keyValidation.value,
        expiresIn: resolvedExpiresIn,
      },
      downloadUrl,
      bucket,
      key: keyValidation.value,
      expiresIn: resolvedExpiresIn,
    });
  } catch (error) {
    errorLog(SCOPE, 'unexpected_error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return errorResponse(500, 'unexpected_error', 'Erro inesperado ao gerar URL de download.');
  }
});
