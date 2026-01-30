import { getSupabaseAdmin, json, requireAdminAuth } from '../../shared/conta-azul-server';
import { runContaAzulSync } from '../../shared/conta-azul-sync';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const authResult = await requireAdminAuth(req);
  if (!authResult.ok) return json(res, authResult.status, { error: authResult.error });

  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const result = await runContaAzulSync(supabaseAdmin, now);

  if (!result.ok) {
    return json(res, 500, { error: result.error });
  }

  return json(res, 200, { ok: true, imported: result.importedCount });
}
