import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessOperationalSection } from '@/lib/authz';

type GuardScope = 'dashboard' | 'arte' | 'producao' | 'legacy' | 'create' | 'audit';

export default function HubOsAccessGuard({ scope, children }: { scope: GuardScope; children: ReactNode }) {
  const { hubPermissions, hasModuleAccess } = useAuth();
  const context = { hasModuleAccess, permissions: hubPermissions };
  const allowed =
    scope === 'dashboard'
      ? canAccessOperationalSection(context, 'dashboard')
      : scope === 'arte'
        ? canAccessOperationalSection(context, 'art')
        : scope === 'producao'
          ? canAccessOperationalSection(context, 'production')
          : scope === 'legacy'
            ? canAccessOperationalSection(context, 'art') && canAccessOperationalSection(context, 'production')
            : scope === 'create'
              ? hubPermissions.canCreateOs && canAccessOperationalSection(context, 'orders')
              : hubPermissions.canViewAudit && canAccessOperationalSection(context, 'orders');

  if (allowed) return <>{children}</>;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Sem permissão</h1>
      <p className="text-sm text-muted-foreground">Você não tem acesso a esta área do Hub OS.</p>
      <Link href="/">
        <Button variant="outline">Voltar para meus módulos</Button>
      </Link>
    </div>
  );
}
