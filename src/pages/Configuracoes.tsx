import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function Configuracoes() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('consultor');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) toast.error('Erro ao carregar lista');
    else setUsers(data || []);
    setLoading(false);
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

    </div>
  );
}
