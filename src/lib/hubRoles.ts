export const HUB_ROLE_VALUES = [
  'consultor_vendas',
  'arte_finalista',
  'producao',
  'instalador',
  'gerente',
] as const;

export type HubRole = (typeof HUB_ROLE_VALUES)[number];

export const HUB_ROLE_LABEL: Record<HubRole, string> = {
  consultor_vendas: 'Consultor(a) de Vendas',
  arte_finalista: 'Arte Finalista',
  producao: 'Produção',
  instalador: 'Instalador',
  gerente: 'Gerente',
};

export const normalizeRole = (role?: string | null): HubRole | null => {
  if (!role) return null;
  if (role === 'admin') return 'gerente';
  if (role === 'consultor') return 'consultor_vendas';
  if ((HUB_ROLE_VALUES as readonly string[]).includes(role)) return role as HubRole;
  return null;
};

export const isManagerRole = (role?: string | null) => normalizeRole(role) === 'gerente';

export const getRoleLabel = (role?: string | null) => {
  const normalized = normalizeRole(role);
  return normalized ? HUB_ROLE_LABEL[normalized] : role || 'Sem papel';
};

export const getHubPermissions = (role?: string | null) => {
  const normalized = normalizeRole(role);
  const isManager = normalized === 'gerente';

  return {
    normalizedRole: normalized,
    isManager,
    canManageUsers: isManager,
    canCreateOs: isManager || normalized === 'consultor_vendas',
    canViewArteBoard: isManager || normalized === 'consultor_vendas' || normalized === 'arte_finalista',
    canMoveArteBoard: isManager || normalized === 'arte_finalista',
    canViewProducaoBoard: isManager || normalized === 'producao' || normalized === 'instalador',
    canMoveProducaoBoard: isManager || normalized === 'producao',
    canViewHubOS: normalized !== null,
    canViewAudit: isManager,
  };
};
