import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Redirect, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import CreateOrderForm from "@/features/hubos/components/CreateOrderForm";
import type { CreateOrderPrefill } from "@/features/hubos/createOrderDomain";
import {
  findOrderByQuoteId,
} from "@/features/hubos/api";
import { resolveOrderCreationReturnPath } from "@/features/hubos/createOrderNavigation";
import { quoteRepository } from "@/modules/quotes/repositories/quoteRepository";
import { buildQuoteOrderPrefill } from "../quoteOrderPrefill";
import { quoteIdSchema } from "@shared/quotes";

type QuoteSource = {
  quoteId: string;
  quoteNumber: number;
  prefill: CreateOrderPrefill;
};

export default function CreateOrderPage() {
  const { hubPermissions } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [cancelRequestToken, setCancelRequestToken] = useState(0);
  const [source, setSource] = useState<QuoteSource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const params = new URLSearchParams(search);
  const quoteParam = params.get("quote");
  const returnTo = resolveOrderCreationReturnPath(params.get("returnTo"));

  useEffect(() => {
    let cancelled = false;

    if (!quoteParam) {
      setSource(null);
      setSourceError(null);
      setSourceLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setSource(null);
    setSourceError(null);
    setSourceLoading(true);

    void (async () => {
      try {
        const quoteId = quoteIdSchema.parse(quoteParam);
        const quote = await quoteRepository.load(quoteId);

        if (quote.status !== "ACCEPTED") {
          throw new Error("Somente um orçamento aceito pode gerar uma OS.");
        }

        const existing = await findOrderByQuoteId(quoteId);
        if (cancelled) return;

        if (existing) {
          setLocation(`/os/${existing.id}`);
          return;
        }

        const definition = await quoteRepository.loadForm(
          quote.request.productVersionId
        );
        if (cancelled) return;

        const product =
          definition.products.find(
            item =>
              item.productVersionId === quote.request.productVersionId
          ) ?? null;

        if (!product) {
          throw new Error(
            "A definição do produto deste orçamento não está disponível."
          );
        }

        setSource({
          quoteId,
          quoteNumber: quote.quoteNumber,
          prefill: buildQuoteOrderPrefill(quote, product),
        });
      } catch (error) {
        if (!cancelled)
          setSourceError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o orçamento."
          );
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quoteParam, setLocation]);

  if (!hubPermissions.canCreateOs) return <Redirect to="/os" />;

  if (sourceLoading || (quoteParam && !source && !sourceError))
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparando a Ordem de Serviço</CardTitle>
          <CardDescription>
            Carregando os dados oficiais do orçamento aceito.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  if (sourceError)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Não foi possível iniciar a OS</CardTitle>
          <CardDescription>{sourceError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setLocation(returnTo)}>
            Voltar
          </Button>
        </CardContent>
      </Card>
    );

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
              {source
                ? "Complete os dados operacionais. Produto, quantidade e medidas vêm do orçamento aprovado."
                : "Transforme uma venda aprovada em uma ordem operacional."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {source && (
              <Badge variant="outline">
                Origem: Orçamento #{source.quoteNumber}
              </Badge>
            )}
            <Badge variant="secondary">Destino: Caixa de Entrada · Arte</Badge>
          </div>
        </div>
      </header>

      <CreateOrderForm
        key={source?.quoteId ?? "manual"}
        cancelRequestToken={cancelRequestToken}
        prefill={source?.prefill ?? null}
        sourceQuoteId={source?.quoteId ?? null}
        onCancel={() => setLocation(returnTo)}
        onCompleted={order =>
          setLocation(source ? `/os/${order.id}` : returnTo)
        }
      />
    </div>
  );
}
