import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Edit, KeyRound, Power, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HUB_ROLE_LABEL, HUB_ROLE_VALUES, type HubRole } from '@/lib/hubRoles';
import { APP_MODULES, type AppModuleKey } from '@/constants/modules';

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: HubRole;
  created_at: string | null;
  last_sign_in_at: string | null;
  status: 'ativo' | 'bloqueado';
  modules: AppModuleKey[];
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
};

const moduleLabelByKey = APP_MODULES.reduce<Record<string, string>>((acc, module) => {
  acc[module.key] = module.label;
  return acc;
}, {});

export default function Configuracoes() {
  const { session, hubPermissions } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<HubRole>('consultor_vendas');
  const [newModules, setNewModules] = useState<AppModuleKey[]>([]);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<HubRole>('consultor_vendas');
  const [editModules, setEditModules] = useState<AppModuleKey[]>([]);

  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const buildAuthHeaders = (accessToken: string, extra?: HeadersInit) => {
    const headers = new Headers(extra);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return headers;
  };

  const requestAdminUsers = async (options: RequestInit) => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const doFetch = (token: string) =>
      fetch('/api/admin-users', {
        ...options,
        headers: buildAuthHeaders(token, options.headers),
      });

    let response = await doFetch(accessToken);

    if (response.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshed.session?.access_token;

      if (!refreshError && refreshedToken) {
        response = await doFetch(refreshedToken);
      }
    }

    return response;
  };

  const fetchUsers = async () => {
    if (!session?.access_token) {
      setLoadingUsers(false);
      return;
    }
    setLoadingUsers(true);
    try {
      const response = await requestAdminUsers({ method: 'GET' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao carregar usuários.');
      setUsers(result.data?.users || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar usuários.');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [session?.access_token]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const normalizedSearch = search.toLowerCase();
    return users.filter((user) => {
      const text = `${user.name || ''} ${user.email || ''}`.toLowerCase();
      return text.includes(normalizedSearch);
    });
  }, [search, users]);

  const toggleModule = (
    moduleKey: AppModuleKey,
    checked: boolean,
    setter: Dispatch<SetStateAction<AppModuleKey[]>>
  ) => {
    setter((prev) => {
      if (checked) return Array.from(new Set([...prev, moduleKey]));
      return prev.filter((key) => key !== moduleKey);
    });
  };

  const handleCreateUser = async () => {
    if (!newEmail.includes('@')) return toast.error('Informe um e-mail válido.');
    if (newPassword.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (!newName.trim()) return toast.error('Informe o nome.');

    setCreating(true);
    try {
      const response = await requestAdminUsers({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          name: newName.trim(),
          role: newRole,
          modules: newModules,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao criar usuário.');

      toast.success('Usuário criado com sucesso.');
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('consultor_vendas');
      setNewModules([]);
      setCreateOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao criar usuário.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!editName.trim()) return toast.error('Informe o nome.');

    setSavingEdit(true);
    try {
      const response = await requestAdminUsers({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          name: editName.trim(),
          role: editRole,
          modules: editModules,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao editar usuário.');
      toast.success('Usuário atualizado com sucesso.');
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao editar usuário.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSavePassword = async () => {
    if (!passwordUser) return;
    if (password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (password !== passwordConfirm) return toast.error('As senhas não coincidem.');

    setSavingPassword(true);
    try {
      const response = await requestAdminUsers({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: passwordUser.id, newPassword: password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao redefinir senha.');
      toast.success('Senha redefinida com sucesso.');
      setPasswordUser(null);
      setPassword('');
      setPasswordConfirm('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao redefinir senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    const nextActive = user.status !== 'ativo';
    if (!confirm(`${nextActive ? 'Reativar' : 'Desativar'} o usuário ${user.email}?`)) return;

    setTogglingId(user.id);
    try {
      const response = await requestAdminUsers({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, setActive: nextActive }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao alterar status.');
      toast.success(`Usuário ${nextActive ? 'reativado' : 'desativado'} com sucesso.`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  if (!hubPermissions.canManageUsers) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar a Gestão de Usuários do Hub OS.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Usuários (Hub OS)</h1>
          <p className="text-sm text-muted-foreground">Gerencie papéis, senha e status dos usuários do Hub OS.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Criar usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
              <DialogDescription>Crie um novo usuário para o Hub OS.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="E-mail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Input
                placeholder="Senha temporária"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Select value={newRole} onValueChange={(value) => setNewRole(value as HubRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Papel" />
                </SelectTrigger>
                <SelectContent>
                  {HUB_ROLE_VALUES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {HUB_ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Módulos</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewModules(APP_MODULES.map((module) => module.key))}
                    >
                      Selecionar todos
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewModules([])}>
                      Limpar
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {APP_MODULES.map((module) => (
                    <label key={module.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={newModules.includes(module.key)}
                        onCheckedChange={(checked) => toggleModule(module.key, Boolean(checked), setNewModules)}
                      />
                      {module.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={creating} onClick={handleCreateUser}>
                {creating ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último login</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingUsers ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Carregando usuários...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name || '—'}</TableCell>
                    <TableCell>{user.email || '—'}</TableCell>
                    <TableCell>{HUB_ROLE_LABEL[user.role]}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {user.modules?.length ? (
                          user.modules.map((moduleKey) => (
                            <Badge key={moduleKey} variant="outline">
                              {moduleLabelByKey[moduleKey] || moduleKey}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem permissão</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'ativo' ? 'default' : 'secondary'}>{user.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(user.last_sign_in_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingUser(user);
                            setEditName(user.name || '');
                            setEditRole(user.role);
                            setEditModules(user.modules || []);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPasswordUser(user)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={togglingId === user.id}
                          onClick={() => handleToggleStatus(user)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome" value={editName} onChange={(event) => setEditName(event.target.value)} />
            <Select value={editRole} onValueChange={(value) => setEditRole(value as HubRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HUB_ROLE_VALUES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {HUB_ROLE_LABEL[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Módulos</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditModules(APP_MODULES.map((module) => module.key))}
                  >
                    Selecionar todos
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditModules([])}>
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {APP_MODULES.map((module) => (
                  <label key={module.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editModules.includes(module.key)}
                      onCheckedChange={(checked) => toggleModule(module.key, Boolean(checked), setEditModules)}
                    />
                    {module.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button disabled={savingEdit} onClick={handleSaveEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordUser} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>{passwordUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Nova senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirmar nova senha"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordUser(null);
                setPassword('');
                setPasswordConfirm('');
              }}
            >
              Cancelar
            </Button>
            <Button disabled={savingPassword} onClick={handleSavePassword}>
              {savingPassword ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
