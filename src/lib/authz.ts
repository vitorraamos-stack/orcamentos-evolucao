import { getHubPermissions, normalizeRole } from '@/lib/hubRoles';
import type { AppModuleKey } from '@/constants/modules';

export type AuthorizationSnapshot = {
  rawRole: string | null;
  normalizedRole: ReturnType<typeof normalizeRole>;
  isAdmin: boolean;
  permissions: ReturnType<typeof getHubPermissions>;
};

export const buildAuthorizationSnapshot = (role: string | null | undefined): AuthorizationSnapshot => {
  const rawRole = role ?? null;
  const permissions = getHubPermissions(rawRole);

  return {
    rawRole,
    normalizedRole: permissions.normalizedRole,
    isAdmin: permissions.isManager,
    permissions,
  };
};

type RouteAccessContext = {
  hasModuleAccess: (moduleKey: AppModuleKey) => boolean;
  permissions: AuthorizationSnapshot['permissions'];
};

export const canAccessConfiguracoes = (context: RouteAccessContext) =>
  context.hasModuleAccess('configuracoes') && context.permissions.canManageUsers;

export const canAccessMateriais = (context: RouteAccessContext) =>
  context.hasModuleAccess('materiais') && context.permissions.isManager;

export const canAccessHubAudit = (context: RouteAccessContext) =>
  context.hasModuleAccess('hub_os') && context.permissions.canViewAudit;

export const canAccessHubFinanceiro = (context: RouteAccessContext) =>
  context.hasModuleAccess('hub_os_financeiro');

export type OperationalSection = 'orders' | 'dashboard' | 'art' | 'production';

// A Central de OS é a permissão-base; Dashboard e quadros exigem módulos próprios.
export const canAccessOperationalSection = (
  context: RouteAccessContext,
  section: OperationalSection
): boolean => {
  if (!context.permissions.canViewHubOS || !context.hasModuleAccess('hub_os')) return false;
  switch (section) {
    case 'orders': return true;
    case 'dashboard': return context.hasModuleAccess('hub_os_dashboard');
    case 'art': return context.permissions.canViewArteBoard && context.hasModuleAccess('hub_os_arte');
    case 'production': return context.permissions.canViewProducaoBoard && context.hasModuleAccess('hub_os_producao');
  }
};
