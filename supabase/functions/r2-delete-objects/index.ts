import { DeleteObjectsCommand, S3Client } from 'npm:@aws-sdk/client-s3';
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

type DeletePayload = {
  keys: string[];
  bucket?: string;
  deletionAuditId?: string;
};

const SCOPE = 'r2-delete-objects';

const isProtectedPaymentProofKey = (key: string) =>
  key.includes('/Financeiro/Comprovante/') || key.includes('/payment_proofs/');

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

    let payload: DeletePayload;
    try {
      payload = await request.json();
    } catch {
      return errorResponse(400, 'invalid_json', 'JSON inválido no corpo da requisição.');
    }

    const bucketPayloadError = rejectOrIgnoreBucket(SCOPE, payload.bucket);
    if (bucketPayloadError) return bucketPayloadError;

    const keys = Array.isArray(payload.keys) ? payload.keys.filter((value): value is string => typeof value === 'string') : [];
    if (keys.length === 0) {
      return errorResponse(400, 'invalid_input', 'Nenhuma chave válida foi informada para exclusão.');
    }

    const orderIds: string[] = [];
    for (const key of keys) {
      const keyValidation = validateR2Key(key);
      if (!keyValidation.ok) {
        return errorResponse(400, 'invalid_input', `Chave inválida: ${keyValidation.message}`);
      }
      orderIds.push(extractOrderIdFromR2Key(keyValidation.value));
    }

    try {
      if (payload.deletionAuditId) {
        const { data: profile, error: profileError } = await auth.authClient.from('profiles').select('role').eq('id', auth.user?.id).single();
        if (profileError || !['admin', 'gerente'].includes(profile?.role)) {
          return errorResponse(403, 'forbidden', 'Somente gerente/admin pode limpar arquivos de uma OS excluída.');
        }
        const { data: audit, error: auditError } = await auth.authClient.from('os_order_deletion_audit').select('original_os_id,r2_keys').eq('id', payload.deletionAuditId).single();
        if (auditError || !audit) return errorResponse(403, 'forbidden', 'Auditoria de exclusão inválida.');
        const allowedKeys = new Set<string>(audit.r2_keys ?? []);
        if (keys.some((key) => !allowedKeys.has(key)) || orderIds.some((id) => id !== audit.original_os_id)) {
          return errorResponse(403, 'forbidden', 'Uma ou mais chaves não pertencem à auditoria informada.');
        }
      } else {
        const scopeCheck = await authorizeR2OrderScope(auth.authClient, orderIds);
      if (!scopeCheck.ok) {
        infoLog(SCOPE, 'order_scope_forbidden', {
          userId: auth.user?.id,
          unauthorizedOrderIds: scopeCheck.unauthorizedOrderIds,
        });
        return errorResponse(403, 'forbidden', 'Sem permissão para excluir um ou mais objetos solicitados.');
      }
      }
    } catch (error) {
      errorLog(SCOPE, 'order_scope_query_error', {
        userId: auth.user?.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return errorResponse(403, 'forbidden', 'Não foi possível validar escopo de exclusão dos objetos.');
    }

    const protectedKeys = keys.filter(isProtectedPaymentProofKey);
    if (protectedKeys.length > 0) {
      return errorResponse(
        403,
        'forbidden',
        'Exclusão bloqueada para comprovantes financeiros (política de retenção).',
        { blockedKeys: protectedKeys },
      );
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

    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    });

    const result = await client.send(command);
    const deletedCount = result.Deleted?.length ?? 0;
    const errors =
      result.Errors?.map((error) => ({
        key: error.Key,
        code: error.Code,
        message: error.Message,
      })) ?? [];

    let auditUpdateSucceeded = true;
    if (payload.deletionAuditId) {
      const { error: auditUpdateError } = await auth.authClient.rpc('hub_os_mark_order_delete_cleanup_secure', {
        p_audit_id: payload.deletionAuditId,
        p_deleted_count: deletedCount,
        p_errors: errors,
      });
      auditUpdateSucceeded = !auditUpdateError;
      if (auditUpdateError) errorLog(SCOPE, 'audit_update_failed', { auditId: payload.deletionAuditId, message: auditUpdateError.message });
    }

    infoLog(SCOPE, 'delete_ok', {
      userId: auth.user?.id,
      requested: keys.length,
      deleted: deletedCount,
      errorCount: errors.length,
      orderIds: Array.from(new Set(orderIds)).length,
    });

    return jsonResponse(200, {
      ok: true,
      data: { deleted: deletedCount, errors, storageDeleteSucceeded: true, auditUpdateSucceeded },
      deleted: deletedCount,
      errors,
      storageDeleteSucceeded: true,
      auditUpdateSucceeded,
    });
  } catch (error) {
    errorLog(SCOPE, 'unexpected_error', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return errorResponse(500, 'unexpected_error', 'Erro inesperado ao excluir objetos.');
  }
});
