import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

type GuardScope = 'arte' | 'producao' | 'create' | 'audit';

export default function HubOsAccessGuard({ scope, children }: { scope: GuardScope; children: ReactNode }) {
  const { hubPermissions } = useAuth();

  const allowed =
    scope === 'arte'
      ? hubPermissions.canViewArteBoard
      : scope === 'producao'
        ? hubPermissions.canViewProducaoBoard
        : scope === 'create'
          ? hubPermissions.canCreateOs
          : hubPermissions.canViewAudit;

  if (allowed) return <>{children}</>;

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Sem permissão</h1>
      <p className="text-sm text-muted-foreground">Você não tem acesso a esta área do Hub OS.</p>
      <Link href="/hub-os">
        <Button variant="outline">Voltar para Hub OS</Button>
      </Link>
    </div>
  );
}
