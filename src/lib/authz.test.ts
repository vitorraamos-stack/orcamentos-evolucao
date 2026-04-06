import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationSnapshot,
  canAccessConfiguracoes,
  canAccessHubAudit,
  canAccessMateriais,
  canAccessHubFinanceiro,
} from '@/lib/authz';

describe('buildAuthorizationSnapshot', () => {
  it('nunca promove admin por heurística de e-mail', () => {
    const snapshot = buildAuthorizationSnapshot('consultor_vendas');
    expect(snapshot.isAdmin).toBe(false);
  });

  it('concede admin apenas para papel gerente/admin normalizado', () => {
    expect(buildAuthorizationSnapshot('gerente').isAdmin).toBe(true);
    expect(buildAuthorizationSnapshot('admin').isAdmin).toBe(true);
    expect(buildAuthorizationSnapshot('instalador').isAdmin).toBe(false);
  });
});

describe('route authorization helpers', () => {
  const managerPermissions = buildAuthorizationSnapshot('gerente').permissions;
  const consultantPermissions = buildAuthorizationSnapshot('consultor_vendas').permissions;

  it('configurações exige módulo + permissão de gestão', () => {
    expect(
      canAccessConfiguracoes({
        hasModuleAccess: (key) => key === 'configuracoes',
        permissions: managerPermissions,
      })
    ).toBe(true);

    expect(
      canAccessConfiguracoes({
        hasModuleAccess: () => true,
        permissions: consultantPermissions,
      })
    ).toBe(false);
  });

  it('materiais exige módulo + perfil gerente', () => {
    expect(
      canAccessMateriais({
        hasModuleAccess: (key) => key === 'materiais',
        permissions: managerPermissions,
      })
    ).toBe(true);

    expect(
      canAccessMateriais({
        hasModuleAccess: (key) => key === 'materiais',
        permissions: consultantPermissions,
      })
    ).toBe(false);
  });


  it('financeiro exige módulo hub_os_financeiro', () => {
    expect(
      canAccessHubFinanceiro({
        hasModuleAccess: (key) => key === 'hub_os_financeiro',
        permissions: managerPermissions,
      })
    ).toBe(true);

    expect(
      canAccessHubFinanceiro({
        hasModuleAccess: () => false,
        permissions: managerPermissions,
      })
    ).toBe(false);
  });

  it('auditoria exige módulo hub_os + permissão de auditoria', () => {
    expect(
      canAccessHubAudit({
        hasModuleAccess: (key) => key === 'hub_os',
        permissions: managerPermissions,
      })
    ).toBe(true);

    expect(
      canAccessHubAudit({
        hasModuleAccess: (key) => key === 'hub_os',
        permissions: consultantPermissions,
      })
    ).toBe(false);
  });
});
