import { getSupabaseAdmin, json } from '../../shared/conta-azul-server';
import { runContaAzulSync } from '../../shared/conta-azul-sync';

export default async function handler(req: any, res: any) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method Not Allowed' });

  const cronSecret = req.headers?.['x-cron-secret'] as string | undefined;
  const expectedCronSecret = process.env.CONTA_AZUL_CRON_SECRET;

  if (!cronSecret || !expectedCronSecret || cronSecret !== expectedCronSecret) {
    return json(res, 401, { error: 'Cron secret inválido.' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date();
  const result = await runContaAzulSync(supabaseAdmin, now);

  if (!result.ok) {
    return json(res, 500, { error: result.error });
  }

  return json(res, 200, { ok: true, imported: result.importedCount });
}
