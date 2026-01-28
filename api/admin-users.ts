import { createClient } from '@supabase/supabase-js';

function json(res: any, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, {
      error:
        'Configuração inválida: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do projeto.',
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Auth: Bearer <access_token>
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json(res, 401, { error: 'Token não fornecido.' });

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) return json(res, 401, { error: 'Usuário não autenticado.' });

  // Check admin role
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return json(res, 403, { error: 'Acesso negado. Apenas admins.' });
  }

  // Body (Vercel geralmente já parseia JSON, mas garantimos)
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    if (req.method === 'POST') {
      const { email, password, role } = body || {};
      if (!email || !password) return json(res, 400, { error: 'Informe email e password.' });

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;

      await supabaseAdmin.from('profiles').upsert({
        id: created.user.id,
        email,
        role: role || 'consultor',
      });

      return json(res, 200, { message: 'Usuário criado!' });
    }

    if (req.method === 'DELETE') {
      const { userId } = body || {};
      if (!userId) return json(res, 400, { error: 'Informe userId.' });
      if (userId === user.id) return json(res, 400, { error: 'Você não pode excluir sua própria conta.' });

      const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delError) throw delError;

      await supabaseAdmin.from('profiles').delete().eq('id', userId);

      return json(res, 200, { message: 'Usuário excluído.' });
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err: any) {
    return json(res, 400, { error: err?.message || 'Erro inesperado.' });
  }
}
