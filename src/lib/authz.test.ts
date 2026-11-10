import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationSnapshot,
  canAccessConfiguracoes,
  canAccessHubAudit,
  canAccessMateriais,
  canAccessHubFinanceiro,
  canAccessOperationalSection,
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


describe('permissões individuais das áreas operacionais', () => {
  it('consultora com Central de OS não vê Dashboard, Arte e Produção sem liberação', () => {
    const context = {
      hasModuleAccess: (key: string) => key === 'hub_os',
      permissions: buildAuthorizationSnapshot('consultor_vendas').permissions,
    };
    expect(canAccessOperationalSection(context, 'orders')).toBe(true);
    expect(canAccessOperationalSection(context, 'dashboard')).toBe(false);
    expect(canAccessOperationalSection(context, 'art')).toBe(false);
    expect(canAccessOperationalSection(context, 'production')).toBe(false);
  });

  it('permissão de visualizar um quadro não concede movimentação fora do cargo', () => {
    const context = {
      hasModuleAccess: (key: string) => ['hub_os', 'hub_os_arte', 'hub_os_producao'].includes(key),
      permissions: buildAuthorizationSnapshot('consultor_vendas').permissions,
    };
    expect(canAccessOperationalSection(context, 'art')).toBe(true);
    expect(canAccessOperationalSection(context, 'production')).toBe(true);
    expect(context.permissions.canMoveArteBoard).toBe(false);
    expect(context.permissions.canMoveProducaoBoard).toBe(false);
  });

  it('subáreas exigem a permissão-base da Central', () => {
    const context = {
      hasModuleAccess: (key: string) => key === 'hub_os_dashboard',
      permissions: buildAuthorizationSnapshot('gerente').permissions,
    };
    expect(canAccessOperationalSection(context, 'dashboard')).toBe(false);
  });
});


describe('acessos individuais de Instalações e Entregas', () => {
  const permissions = buildAuthorizationSnapshot('consultor_vendas').permissions;
  it('permite consulta da agenda sem execução nem agendamento', () => {
    const context = {
      hasModuleAccess: (key: string) => ['hub_os', 'hub_os_instalacoes'].includes(key),
      permissions,
    };
    expect(canAccessOperationalSection(context, 'installations')).toBe(true);
    expect(canAccessOperationalSection(context, 'deliveries')).toBe(false);
    expect(permissions.canManageInstallations).toBe(false);
    expect(permissions.canExecuteInstallations).toBe(false);
  });
  it('exige a Central de OS para acessar instalações', () => {
    expect(canAccessOperationalSection({
      hasModuleAccess: (key: string) => key === 'hub_os_instalacoes',
      permissions,
    }, 'installations')).toBe(false);
  });
  it('entregas não conferem permissões de movimentação', () => {
    expect(canAccessOperationalSection({
      hasModuleAccess: (key: string) => ['hub_os', 'hub_os_entregas'].includes(key),
      permissions,
    }, 'deliveries')).toBe(true);
    expect(permissions.canManageDeliveries).toBe(false);
  });
});
