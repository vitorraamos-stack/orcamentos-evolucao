import { getHubPermissions, normalizeRole } from '@/lib/hubRoles';

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
