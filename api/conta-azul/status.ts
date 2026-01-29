import { getSupabaseAdmin, json, requireAdminAuth } from '../../shared/conta-azul-server';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' });

  const authResult = await requireAdminAuth(req);
  if (!authResult.ok) return json(res, authResult.status, { error: authResult.error });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: tokenRow } = await supabaseAdmin
      .from('conta_azul_tokens')
      .select('expires_at')
      .eq('id', 1)
      .maybeSingle();

    const { data: syncRow } = await supabaseAdmin
      .from('conta_azul_sync_state')
      .select('last_sync_at,last_success_at,last_error')
      .eq('id', 1)
      .maybeSingle();

    return json(res, 200, {
      connected: Boolean(tokenRow?.expires_at),
      token_expires_at: tokenRow?.expires_at ?? null,
      last_sync_at: syncRow?.last_sync_at ?? null,
      last_success_at: syncRow?.last_success_at ?? null,
      last_error: syncRow?.last_error ?? null,
    });
  } catch (error: any) {
    return json(res, 500, { error: error?.message || 'Erro ao carregar status.' });
  }
}
