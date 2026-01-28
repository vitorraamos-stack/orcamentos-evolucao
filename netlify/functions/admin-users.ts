import { createClient } from '@supabase/supabase-js';

export const handler = async (event: any) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { statusCode: 500, body: 'Erro de configuração do servidor.' };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const method = event.httpMethod;
  const body = JSON.parse(event.body || '{}');

  // Verifica se quem chama é Admin
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) return { statusCode: 401, body: 'Token não fornecido' };

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return { statusCode: 401, body: 'Usuário não autenticado' };

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Acesso negado. Apenas admins.' }) };
  }

  try {
    if (method === 'POST') {
      const { email, password, role } = body;
      // Cria usuário no Auth
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createError) throw createError;

      // Cria perfil na tabela
      await supabaseAdmin.from('profiles').insert({
        id: newUser.user.id,
        email: email,
        role: role || 'consultor'
      });

      return { statusCode: 200, body: JSON.stringify({ message: 'Usuário criado!' }) };
    }

    if (method === 'DELETE') {
      const { userId } = body;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
      
      // Remove da tabela profiles por garantia
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      
      return { statusCode: 200, body: JSON.stringify({ message: 'Usuário excluído.' }) };
    }
  } catch (error: any) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
