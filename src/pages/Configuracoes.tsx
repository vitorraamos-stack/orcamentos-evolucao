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
import { ChevronDown, Edit, KeyRound, Power, Search, UserPlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { HUB_ROLE_LABEL, HUB_ROLE_VALUES, type HubRole } from '@/lib/hubRoles';
import { APP_MODULES, type AppModuleKey } from '@/constants/modules';
import UserAvatarEditor from '@/components/UserAvatarEditor';

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
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const moduleLabelByKey = APP_MODULES.reduce<Record<string, string>>((acc, module) => {
  acc[module.key] = module.label;
  return acc;
}, {});


const HUB_OS_CHILD_MODULES: readonly AppModuleKey[] = ['hub_os_dashboard', 'hub_os_arte', 'hub_os_producao', 'hub_os_instalacoes', 'hub_os_entregas', 'regras_operacionais'];
const MODULE_GROUPS: ReadonlyArray<{ label: string; keys: readonly AppModuleKey[] }> = [
  { label: 'Operação', keys: ['hub_os', 'hub_os_dashboard', 'hub_os_arte', 'hub_os_producao', 'hub_os_instalacoes', 'hub_os_entregas', 'hub_os_insumos', 'hub_os_producao_externa', 'hub_os_kiosk', 'impressao_estoque'] },
  { label: 'Comercial', keys: ['orcamentista', 'calculadora', 'biblioteca_produtos'] },
  { label: 'Recursos', keys: ['galeria', 'materiais'] },
  { label: 'Administração', keys: ['hub_os_financeiro', 'biblioteca_gestao', 'precos_custos', 'regras_operacionais', 'configuracoes'] },
];

const LEGACY_MODULE_LABELS: Record<string, string> = {
  hub_os_producao_extras: 'Hub OS - Produção (Extras)',
};

const getModuleLabel = (moduleKey: string) => {
  const normalized = moduleKey.trim().toLowerCase();
  return (
    moduleLabelByKey[moduleKey] ||
    moduleLabelByKey[normalized] ||
    LEGACY_MODULE_LABELS[normalized] ||
    moduleKey
  );
};

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

  const parseApiResponse = async (response: Response) => {
    const raw = await response.text();

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as any;
    } catch {
      const fallbackMessage = raw
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);

      throw new Error(
        fallbackMessage ||
          'A API retornou uma resposta inválida. Verifique o endpoint /api/admin-users.'
      );
    }
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
      const result = await parseApiResponse(response);
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
      if (checked) return Array.from(new Set([...prev, moduleKey, ...(HUB_OS_CHILD_MODULES.includes(moduleKey) ? ['hub_os' as AppModuleKey] : [])]));
      if (moduleKey === 'hub_os') return prev.filter((key) => key !== 'hub_os' && !HUB_OS_CHILD_MODULES.includes(key));
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
      const result = await parseApiResponse(response);
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
      const result = await parseApiResponse(response);
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
      const result = await parseApiResponse(response);
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
      const result = await parseApiResponse(response);
      if (!response.ok) throw new Error(result.error?.message || 'Erro ao alterar status.');
      toast.success(`Usuário ${nextActive ? 'reativado' : 'desativado'} com sucesso.`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };


  const renderModuleAccess = (user: AdminUser) => {
    const modules = user.modules || [];
    if (!modules.length) {
      return <span className="text-xs text-muted-foreground">Sem permissão</span>;
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-full gap-1.5 px-2.5 font-normal"
            aria-label={`Ver os ${modules.length} módulos de ${user.name || user.email || 'usuário'}`}
          >
            {modules.length} {modules.length === 1 ? 'módulo' : 'módulos'}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(320px,calc(100vw-2rem))] space-y-3">
          <p className="text-sm font-semibold">Módulos permitidos</p>
          <div className="flex flex-wrap gap-1.5">
            {modules.map((moduleKey) => (
              <Badge key={moduleKey} variant="outline" className="whitespace-normal text-left leading-5">
                {getModuleLabel(moduleKey)}
              </Badge>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderUserActions = (user: AdminUser) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label={`Editar ${user.name || user.email || 'usuário'}`}
        title="Editar usuário"
        onClick={() => {
          setEditingUser(user);
          setEditName(user.name || '');
          setEditRole(user.role);
          setEditModules(user.modules || []);
        }}
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label={`Redefinir senha de ${user.name || user.email || 'usuário'}`}
        title="Redefinir senha"
        onClick={() => setPasswordUser(user)}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label={`${user.status === 'ativo' ? 'Desativar' : 'Reativar'} ${user.name || user.email || 'usuário'}`}
        title={user.status === 'ativo' ? 'Desativar usuário' : 'Reativar usuário'}
        disabled={togglingId === user.id}
        onClick={() => handleToggleStatus(user)}
      >
        <Power className="h-4 w-4" />
      </Button>
    </div>
  );

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Gestão de Usuários (Hub OS)</h1>
          <p className="text-sm text-muted-foreground">Gerencie papéis, senha e status dos usuários do Hub OS.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Criar usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
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
                <div className="max-h-[340px] space-y-4 overflow-y-auto rounded-lg border p-3">
                  {MODULE_GROUPS.map((group) => (
                    <section key={group.label} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.keys.map((key) => {
                          const module = APP_MODULES.find((entry) => entry.key === key);
                          if (!module) return null;
                          const isChild = HUB_OS_CHILD_MODULES.includes(key);
                          return (
                            <label key={key} className={`flex items-center gap-2 text-sm ${isChild ? 'pl-2' : ''}`}>
                              <Checkbox
                                checked={newModules.includes(key)}
                                disabled={isChild && !newModules.includes('hub_os')}
                                onCheckedChange={(checked) => toggleModule(key, Boolean(checked), setNewModules)}
                              />
                              {module.label}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Dashboard, quadros, Instalações, Entregas e Regras Operacionais exigem acesso à Central de OS. O cargo define as ações permitidas.</p>
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


      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Usuários</CardTitle>
            <p className="text-xs text-muted-foreground">
              {filteredUsers.length} de {users.length} cadastrados
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar usuários por nome ou e-mail"
              className="pl-9"
              placeholder="Buscar por nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="hidden xl:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Usuário</TableHead>
                  <TableHead className="w-[19%]">Papel</TableHead>
                  <TableHead className="w-[15%]">Módulos</TableHead>
                  <TableHead className="w-[9%]">Status</TableHead>
                  <TableHead className="w-[15%]">Último login</TableHead>
                  <TableHead className="w-[12%] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsers ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Carregando usuários...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="min-w-0 py-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate font-medium" title={user.name || undefined}>{user.name || 'Sem nome'}</p>
                          <p className="truncate text-xs text-muted-foreground" title={user.email || undefined}>
                            {user.email || '—'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal py-3 leading-5">
                        {HUB_ROLE_LABEL[user.role]}
                      </TableCell>
                      <TableCell className="py-3">{renderModuleAccess(user)}</TableCell>
                      <TableCell className="py-3">
                        <Badge variant={user.status === 'ativo' ? 'default' : 'secondary'}>{user.status}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal py-3 text-sm text-muted-foreground">
                        {formatDate(user.last_sign_in_at)}
                      </TableCell>
                      <TableCell className="py-3">{renderUserActions(user)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {loadingUsers ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando usuários...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{user.name || 'Sem nome'}</p>
                      <p className="break-all text-xs text-muted-foreground">{user.email || '—'}</p>
                    </div>
                    <Badge className="shrink-0" variant={user.status === 'ativo' ? 'default' : 'secondary'}>
                      {user.status}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Papel</dt>
                      <dd className="mt-1 text-sm">{HUB_ROLE_LABEL[user.role]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Último login</dt>
                      <dd className="mt-1 text-sm">{formatDate(user.last_sign_in_at)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="mb-1 text-xs text-muted-foreground">Módulos</dt>
                      <dd>{renderModuleAccess(user)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t pt-3">{renderUserActions(user)}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingUser && <UserAvatarEditor key={editingUser.id} userId={editingUser.id} displayName={editName || editingUser.name || 'Usuário'} />}
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
              <div className="max-h-[340px] space-y-4 overflow-y-auto rounded-lg border p-3">
                  {MODULE_GROUPS.map((group) => (
                    <section key={group.label} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.keys.map((key) => {
                          const module = APP_MODULES.find((entry) => entry.key === key);
                          if (!module) return null;
                          const isChild = HUB_OS_CHILD_MODULES.includes(key);
                          return (
                            <label key={key} className={`flex items-center gap-2 text-sm ${isChild ? 'pl-2' : ''}`}>
                              <Checkbox
                                checked={editModules.includes(key)}
                                disabled={isChild && !editModules.includes('hub_os')}
                                onCheckedChange={(checked) => toggleModule(key, Boolean(checked), setEditModules)}
                              />
                              {module.label}
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Dashboard, quadros, Instalações, Entregas e Regras Operacionais exigem acesso à Central de OS. O cargo define as ações permitidas.</p>
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
