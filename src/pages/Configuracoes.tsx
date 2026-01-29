import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trash2, UserPlus, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function Configuracoes() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [contaAzulStatus, setContaAzulStatus] = useState<{
    connected: boolean;
    token_expires_at: string | null;
    last_sync_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
  } | null>(null);
  const [contaAzulLoading, setContaAzulLoading] = useState(false);
  
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('consultor');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchCurrentUserRole();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) toast.error('Erro ao carregar lista');
    else setUsers(data || []);
    setLoading(false);
  };

  const fetchCurrentUserRole = async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    const admin = profile?.role === 'admin';
    setIsAdmin(admin);
    if (admin) {
      fetchContaAzulStatus();
    }
  };

  const fetchContaAzulStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/conta-azul/status', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao carregar status.');
      setContaAzulStatus(result);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleContaAzulConnect = async () => {
    setContaAzulLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/conta-azul/oauth/start?format=json', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao iniciar conexão.');
      window.location.href = result.url;
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setContaAzulLoading(false);
    }
  };

  const handleContaAzulSync = async () => {
    setContaAzulLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/conta-azul/sync-admin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao sincronizar.');
      toast.success('Sincronização concluída.');
      fetchContaAzulStatus();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setContaAzulLoading(false);
    }
  };

  const handleContaAzulDisconnect = async () => {
    if (!confirm('Desconectar Conta Azul?')) return;
    setContaAzulLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/conta-azul/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao desconectar.');
      toast.success('Conta Azul desconectada.');
      setContaAzulStatus({
        connected: false,
        token_expires_at: null,
        last_sync_at: null,
        last_success_at: null,
        last_error: null,
      });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setContaAzulLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword) return toast.error('Preencha e-mail e senha');
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar');

      toast.success('Usuário criado com sucesso!');
      setNewEmail(''); setNewPassword('');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza? Essa ação não pode ser desfeita.')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin-users', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ userId })
      });
      if (!response.ok) throw new Error('Erro ao excluir');
      toast.success('Usuário removido');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) toast.error('Erro ao atualizar permissão');
    else { toast.success('Permissão atualizada!'); fetchUsers(); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Equipe & Permissões</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Formulário de Criação */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5"/> Novo Membro</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">E-mail Profissional</label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="vendedor@evolucao.com" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Senha Inicial</label>
              <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="******" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Nível de Acesso</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultor">Consultor (Vendedor)</SelectItem>
                  <SelectItem value="admin">Administrador (Dono)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleCreateUser} disabled={creating}>
              {creating ? 'Processando...' : 'Cadastrar Usuário'}
            </Button>
          </CardContent>
        </Card>

        {/* Lista de Usuários */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Membros Ativos</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Permissão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>
                      <Select defaultValue={user.role} onValueChange={(val) => handleUpdateRole(user.id, val)}>
                        <SelectTrigger className="w-[140px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="consultor">Consultor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteUser(user.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Integração Conta Azul
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              Apenas administradores podem configurar a integração com a Conta Azul.
            </p>
          )}
          {isAdmin && (
            <>
              <div className="grid gap-2 text-sm">
                <p>
                  Status:{' '}
                  <span className={contaAzulStatus?.connected ? 'text-emerald-600' : 'text-muted-foreground'}>
                    {contaAzulStatus?.connected ? 'Conectado' : 'Desconectado'}
                  </span>
                </p>
                <p>Última sincronização: {contaAzulStatus?.last_sync_at ?? '—'}</p>
                <p>Último sucesso: {contaAzulStatus?.last_success_at ?? '—'}</p>
                {contaAzulStatus?.last_error && (
                  <p className="text-destructive">Erro: {contaAzulStatus.last_error}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleContaAzulConnect} disabled={contaAzulLoading}>
                  Conectar Conta Azul
                </Button>
                <Button variant="outline" onClick={handleContaAzulSync} disabled={contaAzulLoading}>
                  Sincronizar agora
                </Button>
                <Button variant="destructive" onClick={handleContaAzulDisconnect} disabled={contaAzulLoading}>
                  Desconectar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
