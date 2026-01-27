import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Debug() {
  const { user, isAdmin } = useAuth();
  const [dbProfile, setDbProfile] = useState<any>(null);
  const [dbError, setDbError] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkDb = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      setDbProfile(data);
      setDbError(error);
    } catch (e) {
      setDbError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkDb();
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Diagnóstico de Permissões</h1>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estado Local (AuthContext)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><strong>User ID:</strong> {user?.id}</p>
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>isAdmin (Variável):</strong> {isAdmin ? 'TRUE (Sim)' : 'FALSE (Não)'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado do Banco de Dados (Supabase)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={checkDb} disabled={loading}>
              {loading ? 'Verificando...' : 'Re-verificar Agora'}
            </Button>
            
            <div className="mt-4 p-4 bg-muted rounded-md overflow-auto text-xs font-mono">
              <p className="font-bold mb-2">Resultado da Query (public.profiles):</p>
              {dbError ? (
                <div className="text-red-500">
                  <strong>ERRO:</strong> {JSON.stringify(dbError, null, 2)}
                </div>
              ) : (
                <div className="text-green-600">
                  <strong>DADOS:</strong> {JSON.stringify(dbProfile, null, 2)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2">
            {isAdmin ? (
              <li className="text-green-600">O sistema reconhece você como Admin. O botão deveria aparecer.</li>
            ) : (
              <li className="text-red-600">O sistema NÃO reconhece você como Admin.</li>
            )}
            
            {dbError && (
              <li className="text-red-600">
                Há um erro ao acessar o banco de dados. Isso geralmente indica que a tabela <code>profiles</code> não existe ou as políticas de segurança (RLS) estão bloqueando o acesso.
                <br/><strong>Solução:</strong> Rode o script <code>supabase_functions.sql</code> novamente.
              </li>
            )}

            {dbProfile && dbProfile.role !== 'admin' && (
              <li className="text-orange-600">
                Seu perfil existe, mas o cargo é <strong>{dbProfile.role}</strong>.
                <br/><strong>Solução:</strong> Rode o script <code>force_admin_by_email.sql</code>.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
