import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = [
  'consultor_vendas',
  'arte_finalista',
  'producao',
  'instalador',
  'gerente',
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

const normalizeRole = (role?: string | null): AllowedRole | null => {
  if (!role) return null;
  if (role === 'admin') return 'gerente';
  if (role === 'consultor') return 'consultor_vendas';
  if ((ALLOWED_ROLES as readonly string[]).includes(role)) return role as AllowedRole;
  return null;
};

function json(res: any, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function requireAdminAuth(req: any, res: any, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    json(res, 401, { error: 'Token não fornecido.' });
    return null;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    json(res, 401, { error: 'Usuário não autenticado.' });
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    json(res, 403, { error: 'Não foi possível validar permissões.' });
    return null;
  }

  const normalizedRole = normalizeRole(profile?.role ?? null);
  if (normalizedRole !== 'gerente') {
    json(res, 403, { error: 'Acesso negado. Apenas gerente.' });
    return null;
  }

  return user;
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
  const currentUser = await requireAdminAuth(req, res, supabaseAdmin);
  if (!currentUser) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  try {
    if (req.method === 'GET') {
      const { data: profiles, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });
      if (profileError) throw profileError;

      const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      const authById = new Map((authUsers.users || []).map((item) => [item.id, item]));

      const users = (profiles || []).map((profile) => {
        const authUser = authById.get(profile.id);
        return {
          id: profile.id,
          email: profile.email || authUser?.email || null,
          name: authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || null,
          role: normalizeRole(profile.role) ?? 'consultor_vendas',
          created_at: profile.created_at,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          status: authUser?.banned_until ? 'bloqueado' : 'ativo',
        };
      });

      return json(res, 200, { users });
    }

    if (req.method === 'POST') {
      const { email, password, role, name } = body || {};
      const normalizedRole = normalizeRole(role);

      if (!email || !password || !name) {
        return json(res, 400, { error: 'Informe email, password, name e role.' });
      }
      if (!normalizedRole) return json(res, 400, { error: 'Role inválido.' });
      if (String(password).length < 6) {
        return json(res, 400, { error: 'A senha deve ter ao menos 6 caracteres.' });
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, name },
      });
      if (createError) throw createError;

      const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({
        id: created.user.id,
        email,
        role: normalizedRole,
      });
      if (upsertError) throw upsertError;

      return json(res, 200, { message: 'Usuário criado com sucesso.' });
    }

    if (req.method === 'PATCH') {
      const { userId, role, newPassword, setActive, name } = body || {};
      if (!userId) return json(res, 400, { error: 'Informe userId.' });
      if (userId === currentUser.id && setActive === false) {
        return json(res, 400, { error: 'Você não pode desativar sua própria conta.' });
      }

      const normalizedRole = role === undefined ? undefined : normalizeRole(role);
      if (role !== undefined && !normalizedRole) return json(res, 400, { error: 'Role inválido.' });
      if (newPassword !== undefined && String(newPassword).length < 6) {
        return json(res, 400, { error: 'A nova senha deve ter ao menos 6 caracteres.' });
      }

      if (normalizedRole) {
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({ role: normalizedRole })
          .eq('id', userId);
        if (profileUpdateError) throw profileUpdateError;
      }

      const authPayload: Record<string, unknown> = {};
      if (typeof name === 'string' && name.trim()) authPayload.user_metadata = { full_name: name, name };
      if (newPassword) authPayload.password = newPassword;
      if (setActive === false) authPayload.ban_duration = '876000h';
      if (setActive === true) authPayload.ban_duration = 'none';

      if (Object.keys(authPayload).length > 0) {
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, authPayload);
        if (authUpdateError) throw authUpdateError;
      }

      return json(res, 200, { message: 'Usuário atualizado com sucesso.' });
    }

    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err: any) {
    return json(res, 400, { error: err?.message || 'Erro inesperado.' });
  }
}
