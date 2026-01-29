import { createClient } from '@supabase/supabase-js';

type AdminAuthResult =
  | { ok: true; userId: string | null }
  | { ok: false; status: number; error: string };

export const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Configuração inválida: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

export const getAuthToken = (req: any) => {
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '') as string;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
};

export const requireAdminAuth = async (req: any): Promise<AdminAuthResult> => {
  const adminToken = process.env.ADMIN_FUNCTION_TOKEN;
  const token = getAuthToken(req);

  if (!token) {
    return { ok: false, status: 401, error: 'Token não fornecido.' };
  }

  if (adminToken && token === adminToken) {
    return { ok: true, userId: null };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;

    if (authError || !user) {
      return { ok: false, status: 401, error: 'Usuário não autenticado.' };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return { ok: false, status: 403, error: 'Acesso negado. Apenas admins.' };
    }

    return { ok: true, userId: user.id };
  } catch (error: any) {
    return { ok: false, status: 500, error: error?.message || 'Erro ao validar acesso.' };
  }
};

export const json = (res: any, status: number, payload: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export const getBaseUrl = (req: any) => {
  const protoHeader = (req.headers?.['x-forwarded-proto'] || 'https') as string;
  const hostHeader =
    (req.headers?.['x-forwarded-host'] as string) ||
    (req.headers?.host as string) ||
    '';
  return `${protoHeader}://${hostHeader}`;
};

export const parseBody = (req: any) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body;
};
