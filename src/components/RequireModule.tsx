import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { AppModuleKey } from '@/constants/modules';

type RequireModuleProps = {
  moduleKey: AppModuleKey;
  children: ReactNode;
};

export default function RequireModule({ moduleKey, children }: RequireModuleProps) {
  const { hasModuleAccess } = useAuth();

  if (hasModuleAccess(moduleKey)) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Sem permissão</h1>
      <p className="text-sm text-muted-foreground">Você não tem acesso a este módulo.</p>
      <Link href="/">
        <Button variant="outline">Voltar para o início</Button>
      </Link>
    </div>
  );
}
