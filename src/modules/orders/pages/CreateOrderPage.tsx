import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Redirect, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import CreateOrderForm from "@/features/hubos/components/CreateOrderForm";
import { resolveOrderCreationReturnPath } from "@/features/hubos/createOrderNavigation";

export default function CreateOrderPage() {
  const { hubPermissions } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [cancelRequestToken, setCancelRequestToken] = useState(0);

  const params = new URLSearchParams(search);
  const returnTo = resolveOrderCreationReturnPath(params.get("returnTo"));

  if (!hubPermissions.canCreateOs) return <Redirect to="/os" />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-24">
      <header className="space-y-3">
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          onClick={() => setCancelRequestToken(value => value + 1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Nova Ordem de Serviço</h1>
            <p className="text-sm text-muted-foreground">
              Transforme uma venda aprovada no Conta Azul em uma ordem operacional.
            </p>
          </div>
          <Badge variant="secondary">Destino: Caixa de Entrada · Arte</Badge>
        </div>
      </header>

      <CreateOrderForm
        cancelRequestToken={cancelRequestToken}
        onCancel={() => setLocation(returnTo)}
        onCompleted={() => setLocation(returnTo)}
      />
    </div>
  );
}
