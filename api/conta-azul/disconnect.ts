import { getSupabaseAdmin, json, parseBody, requireAdminAuth } from '../../shared/conta-azul-server';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const authResult = await requireAdminAuth(req);
  if (!authResult.ok) return json(res, authResult.status, { error: authResult.error });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = parseBody(req);

    await supabaseAdmin.from('conta_azul_tokens').delete().neq('id', 0);
    await supabaseAdmin.from('conta_azul_sync_state').update({
      last_sync_at: null,
      last_success_at: null,
      last_error: null,
    }).eq('id', 1);

    return json(res, 200, { ok: true, message: body?.message || 'Conta Azul desconectada.' });
  } catch (error: any) {
    return json(res, 500, { error: error?.message || 'Erro ao desconectar.' });
  }
}
