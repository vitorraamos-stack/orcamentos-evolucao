import { useEffect, useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { buildAuthorizationSnapshot } from "@/lib/authz";

/**
 * Resolve the landing page from the user's actual module access.
 * This route is visited on login and on direct visits to the site root.
 * Explicit deep links are not redirected.
 */
export default function InitialRoute() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [result, setResult] = useState<{
    userId: string;
    target: string | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !userId) return;

    let cancelled = false;

    const resolve = async () => {
      const [profileResponse, modulesResponse] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
        supabase.from("user_module_access").select("module_key").eq("user_id", userId),
      ]);

      if (cancelled) return;

      if (profileResponse.error || modulesResponse.error) {
        setResult({ userId, target: null, error: true });
        return;
      }

      const access = new Set((modulesResponse.data ?? []).map((entry) => entry.module_key));
      const permissions = buildAuthorizationSnapshot(profileResponse.data?.role ?? null).permissions;
      const has = (key: string) => access.has(key);

      // The Central de OS is the default landing page whenever authorized.
      const target =
        (permissions.canViewHubOS && has("hub_os") && "/os") ||
        (has("impressao_estoque") && "/impressao-estoque") ||
        (has("calculadora") && "/calculadora") ||
        (permissions.canCreateOs && has("biblioteca_produtos") && "/biblioteca") ||
        (has("galeria") && "/galeria") ||
        (has("hub_os_financeiro") && "/financeiro") ||
        (permissions.canManageUsers && has("configuracoes") && "/configuracoes") ||
        (permissions.isManager && has("materiais") && "/materiais") ||
        null;

      setResult({ userId, target, error: false });
    };

    void resolve().catch(() => {
      if (!cancelled) setResult({ userId, target: null, error: true });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <span className="text-sm text-muted-foreground">Preparando seu acesso...</span>
      </div>
    );
  }

  if (!userId) return <Redirect to="/login" />;

  if (!result || result.userId !== userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <span className="text-sm text-muted-foreground">Carregando seus módulos...</span>
      </div>
    );
  }

  if (result.target) return <Redirect to={result.target} />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">
        {result.error ? "Não foi possível carregar suas permissões" : "Nenhum módulo disponível"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {result.error
          ? "Tente atualizar a página. Se o problema continuar, contate a gestão."
          : "Seu usuário ainda não possui acesso a módulos do sistema. Contate a gestão."}
      </p>
      {result.error && (
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      )}
    </main>
  );
}
