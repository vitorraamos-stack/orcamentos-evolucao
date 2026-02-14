import { createClient } from '@supabase/supabase-js';

type AppModuleKey = string;
const CONFIG_MODULE_KEY: AppModuleKey = 'configuracoes';
const KIOSK_MODULE_KEY: AppModuleKey = 'hub_os_kiosk';

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

function jsonOk(res: any, status: number, data: any) {
  return json(res, status, { ok: true, data });
}

function jsonError(res: any, status: number, code: string, message: string) {
  return json(res, status, { ok: false, error: { code, message } });
}

const parseModules = (modules: unknown, allowedModuleKeys: readonly string[]) => {
  if (modules === undefined) return undefined;
  if (!Array.isArray(modules)) return { error: 'Modules deve ser um array.' } as const;
  const normalized = modules.map((module) => String(module).trim());
  const invalid = normalized.filter((module) => !allowedModuleKeys.includes(module));
  if (invalid.length > 0) {
    return { error: `Módulos inválidos: ${invalid.join(', ')}.` } as const;
  }
  return { value: Array.from(new Set(normalized)) as AppModuleKey[] } as const;
};

async function requireAdminAuth(req: any, res: any, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '') as string;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    jsonError(res, 401, 'unauthorized', 'Token não fornecido.');
    return null;
  }

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (authError || !user) {
    jsonError(res, 401, 'unauthorized', 'Usuário não autenticado.');
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    jsonError(res, 403, 'forbidden', 'Não foi possível validar permissões.');
    return null;
  }

  const normalizedRole = normalizeRole(profile?.role ?? null);
  if (normalizedRole !== 'gerente') {
    jsonError(res, 403, 'forbidden', 'Acesso negado. Apenas gerente.');
    return null;
  }

  return user;
}

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(
      res,
      500,
      'server_config',
      'Configuração inválida: defina SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente do projeto.'
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const currentUser = await requireAdminAuth(req, res, supabaseAdmin);
  if (!currentUser) return;

  const { data: appModules, error: appModulesError } = await supabaseAdmin
    .from('app_modules')
    .select('module_key');

  if (appModulesError) {
    return jsonError(res, 500, 'module_list_error', 'Não foi possível carregar módulos permitidos.');
  }

  const allowedModuleKeys = (appModules || []).map((module) => module.module_key);

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

      const { data: moduleAccessRows, error: moduleError } = await supabaseAdmin
        .from('user_module_access')
        .select('user_id, module_key');
      if (moduleError) throw moduleError;

      const modulesByUser = new Map<string, AppModuleKey[]>();
      (moduleAccessRows || []).forEach((row) => {
        const current = modulesByUser.get(row.user_id) || [];
        if (allowedModuleKeys.includes(row.module_key)) {
          current.push(row.module_key as AppModuleKey);
          modulesByUser.set(row.user_id, current);
        }
      });

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
          modules: modulesByUser.get(profile.id) || [],
        };
      });

      return jsonOk(res, 200, { users });
    }

    if (req.method === 'POST') {
      const { email, password, role, name, modules } = body || {};
      const normalizedRole = normalizeRole(role);
      const parsedModules = parseModules(modules, allowedModuleKeys);

      if (!email || !password || !name) {
        return jsonError(res, 400, 'validation_error', 'Informe email, password, name e role.');
      }
      if (!normalizedRole) return jsonError(res, 400, 'validation_error', 'Role inválido.');
      if (parsedModules && 'error' in parsedModules) {
        return jsonError(res, 400, 'validation_error', parsedModules.error);
      }
      if (String(password).length < 6) {
        return jsonError(res, 400, 'validation_error', 'A senha deve ter ao menos 6 caracteres.');
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

      const moduleList = parsedModules && 'value' in parsedModules ? parsedModules.value : [];
      const requiredManagerModules: AppModuleKey[] = [CONFIG_MODULE_KEY, KIOSK_MODULE_KEY];
      const nextModules = normalizedRole === 'gerente'
        ? requiredManagerModules.reduce(
            (acc, moduleKey) => (acc.includes(moduleKey) ? acc : [...acc, moduleKey]),
            moduleList
          )
        : moduleList;

      if (nextModules.length > 0) {
        const { error: moduleInsertError } = await supabaseAdmin.from('user_module_access').insert(
          nextModules.map((moduleKey) => ({
            user_id: created.user.id,
            module_key: moduleKey,
          }))
        );
        if (moduleInsertError) throw moduleInsertError;
      }

      return jsonOk(res, 200, { message: 'Usuário criado com sucesso.' });
    }

    if (req.method === 'PATCH') {
      const { userId, role, newPassword, setActive, name, modules } = body || {};
      if (!userId) return jsonError(res, 400, 'validation_error', 'Informe userId.');
      if (userId === currentUser.id && setActive === false) {
        return jsonError(res, 400, 'validation_error', 'Você não pode desativar sua própria conta.');
      }

      const normalizedRole = role === undefined ? undefined : normalizeRole(role);
      if (role !== undefined && !normalizedRole) return jsonError(res, 400, 'validation_error', 'Role inválido.');
      const parsedModules = parseModules(modules, allowedModuleKeys);
      if (parsedModules && 'error' in parsedModules) {
        return jsonError(res, 400, 'validation_error', parsedModules.error);
      }
      if (newPassword !== undefined && String(newPassword).length < 6) {
        return jsonError(res, 400, 'validation_error', 'A nova senha deve ter ao menos 6 caracteres.');
      }

      const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .single();
      if (currentProfileError) throw currentProfileError;

      const currentRoleNormalized = normalizeRole(currentProfile?.role ?? null);

      if (userId === currentUser.id && parsedModules && 'value' in parsedModules) {
        if (!parsedModules.value.includes(CONFIG_MODULE_KEY)) {
          return jsonError(
            res,
            400,
            'validation_error',
            'Você não pode remover o acesso ao módulo de Configurações da sua conta.'
          );
        }
      }

      const { data: managerProfiles, error: managerError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .in('role', ['gerente', 'admin']);
      if (managerError) throw managerError;

      const managerIds = new Set((managerProfiles || []).map((profile) => profile.id));
      const isTargetManager = currentRoleNormalized === 'gerente' || managerIds.has(userId);
      const nextRoleIsManager = normalizedRole === undefined ? isTargetManager : normalizedRole === 'gerente';

      if (isTargetManager && !nextRoleIsManager && managerIds.size <= 1) {
        return jsonError(res, 400, 'validation_error', 'O sistema precisa de ao menos um gerente ativo.');
      }

      if (isTargetManager && setActive === false && managerIds.size <= 1) {
        return jsonError(res, 400, 'validation_error', 'O sistema precisa de ao menos um gerente ativo.');
      }

      if (parsedModules && 'value' in parsedModules && isTargetManager) {
        const { data: configAccessRows, error: configAccessError } = await supabaseAdmin
          .from('user_module_access')
          .select('user_id')
          .eq('module_key', CONFIG_MODULE_KEY);
        if (configAccessError) throw configAccessError;

        const managerWithConfig = new Set(
          (configAccessRows || []).map((row) => row.user_id).filter((id) => managerIds.has(id))
        );
        const nextModules = parsedModules.value;
        const nextHasConfig = nextModules.includes(CONFIG_MODULE_KEY);

        if (!nextHasConfig) {
          managerWithConfig.delete(userId);
        } else {
          managerWithConfig.add(userId);
        }

        if (managerWithConfig.size === 0) {
          return jsonError(
            res,
            400,
            'validation_error',
            'É necessário manter ao menos um gerente com acesso ao módulo de Configurações.'
          );
        }
      }

      let ensureManagerModules: AppModuleKey[] | null = null;

      if (normalizedRole === 'gerente' && !(parsedModules && 'value' in parsedModules)) {
        const { data: existingModules, error: existingModulesError } = await supabaseAdmin
          .from('user_module_access')
          .select('module_key')
          .eq('user_id', userId);
        if (existingModulesError) throw existingModulesError;

        const currentModules = (existingModules || [])
          .map((module) => module.module_key)
          .filter((moduleKey): moduleKey is AppModuleKey => allowedModuleKeys.includes(moduleKey));

        const requiredManagerModules: AppModuleKey[] = [CONFIG_MODULE_KEY, KIOSK_MODULE_KEY];
        ensureManagerModules = requiredManagerModules.reduce(
          (acc, moduleKey) => (acc.includes(moduleKey) ? acc : [...acc, moduleKey]),
          currentModules
        );
      }

      if (normalizedRole) {
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({ role: normalizedRole })
          .eq('id', userId);
        if (profileUpdateError) throw profileUpdateError;
      }

      if (parsedModules && 'value' in parsedModules) {
        const requiredManagerModules: AppModuleKey[] = [CONFIG_MODULE_KEY, KIOSK_MODULE_KEY];
        const shouldForceManagerModules = normalizedRole === 'gerente' || (normalizedRole === undefined && isTargetManager);
        const nextModules = shouldForceManagerModules
          ? requiredManagerModules.reduce(
              (acc, moduleKey) => (acc.includes(moduleKey) ? acc : [...acc, moduleKey]),
              parsedModules.value
            )
          : parsedModules.value;

        const { error: moduleUpdateError } = await supabaseAdmin.rpc('set_user_modules', {
          target_user_id: userId,
          module_keys: nextModules,
        });
        if (moduleUpdateError) throw moduleUpdateError;
      }

      if (ensureManagerModules) {
        const { error: moduleUpdateError } = await supabaseAdmin.rpc('set_user_modules', {
          target_user_id: userId,
          module_keys: ensureManagerModules,
        });
        if (moduleUpdateError) throw moduleUpdateError;
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

      return jsonOk(res, 200, { message: 'Usuário atualizado com sucesso.' });
    }

    return jsonError(res, 405, 'method_not_allowed', 'Method Not Allowed');
  } catch (err: any) {
    return jsonError(res, 400, 'unexpected_error', err?.message || 'Erro inesperado.');
  }
}
