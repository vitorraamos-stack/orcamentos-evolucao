import type { Ref } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Keep one actionable recovery region mounted across failed retries.
 * The button remains keyboard-focusable while busy (aria-disabled, not
 * native disabled); the parent prevents duplicate requests.
 */
export function OrdersListRecovery({
  retrying,
  onRetry,
  retryRef,
}: {
  retrying: boolean;
  onRetry: () => void;
  retryRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Card className="evolu-orders__filter-card evolu-ui-panel">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <div role={retrying ? "status" : "alert"} className="flex flex-col items-center gap-2">
          <AlertCircle aria-hidden="true" className="h-7 w-7 text-destructive" />
          <h2 className="font-semibold">
            {retrying ? "Tentando carregar novamente" : "Não foi possível carregar as ordens"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {retrying
              ? "Verificando os resultados da consulta vigente."
              : "Os filtros foram preservados. Você pode tentar novamente."}
          </p>
        </div>
        <Button
          ref={retryRef}
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={retrying}
          onClick={() => { if (!retrying) onRetry(); }}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {retrying ? "Consultando…" : "Tentar novamente"}
        </Button>
      </CardContent>
    </Card>
  );
}
