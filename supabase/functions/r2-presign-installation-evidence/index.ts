import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';
import { corsHeaders, errorLog, errorResponse, getR2Bucket, infoLog, jsonResponse, requireAuthenticatedHubOsUser } from '../_shared/r2-security.ts';

type Phase = 'BEFORE' | 'DURING' | 'AFTER';
type Payload = { installationId: string; phase: Phase; key: string; contentType: string; sizeBytes: number };
const SCOPE = 'r2-presign-installation-evidence';
const MAX = 20 * 1024 * 1024;
const MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
export const isEvidencePhase = (value: unknown): value is Phase => ['BEFORE', 'DURING', 'AFTER'].includes(String(value));
export const evidencePrefix = (osId: string, installationId: string, phase: Phase) => `os_orders/${osId}/Instalacoes/${installationId}/${phase.toLowerCase()}/`;
export const isEvidenceKey = (key: unknown, prefix: string) => typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length && !key.includes('..') && !key.includes('\\');

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Method not allowed.');
  const auth = await requireAuthenticatedHubOsUser(request, SCOPE);
  if (auth.error) return auth.error;
  try {
    const payload = await request.json() as Payload;
    if (!payload.installationId || !isEvidencePhase(payload.phase)) return errorResponse(400, 'invalid_input', 'Instalação ou fase inválida.');
    if (!MIMES.has(payload.contentType)) return errorResponse(400, 'invalid_input', 'Formato de foto não suportado.');
    if (!Number.isFinite(payload.sizeBytes) || payload.sizeBytes <= 0 || payload.sizeBytes > MAX) return errorResponse(400, 'invalid_input', 'Foto fora do limite de 20 MB.');
    const { data: rows, error } = await auth.authClient!.rpc('hub_os_get_installation_evidence_scope_secure', { p_installation_id: payload.installationId, p_phase: payload.phase });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (error || !row) {
      infoLog(SCOPE, 'scope_denied', { userId: auth.user!.id, installationId: payload.installationId, phase: payload.phase, result: 'denied' });
      return errorResponse(403, 'forbidden', error?.message ?? 'Sem permissão para esta instalação.');
    }
    const prefix = evidencePrefix(row.os_id, row.installation_id, payload.phase);
    if (!isEvidenceKey(payload.key, prefix)) return errorResponse(400, 'invalid_input', 'Caminho da evidência inválido.');
    const accountId = Deno.env.get('R2_ACCOUNT_ID'); const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID'); const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    if (!accountId || !accessKeyId || !secretAccessKey) return errorResponse(500, 'server_config', 'Variáveis do R2 não configuradas.');
    const bucket = getR2Bucket();
    const client = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: payload.key, ContentType: payload.contentType, ContentLength: payload.sizeBytes }), { expiresIn: 600 });
    infoLog(SCOPE, 'presign_ok', { userId: auth.user!.id, installationId: row.installation_id, osId: row.os_id, phase: payload.phase, result: 'ok' });
    return jsonResponse(200, { ok: true, data: { uploadUrl, publicKey: payload.key, bucket, expiresIn: 600 }, uploadUrl, publicKey: payload.key, bucket, expiresIn: 600 });
  } catch (error) {
    errorLog(SCOPE, 'unexpected_error', { result: 'error', message: error instanceof Error ? error.message : 'unknown' });
    return errorResponse(500, 'unexpected_error', 'Erro inesperado ao gerar URL de upload.');
  }
});
