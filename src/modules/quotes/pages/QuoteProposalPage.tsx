import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { quoteRepository } from "../repositories/quoteRepository";
import {
  buildQuoteProposalData,
  buildQuoteProposalPrintHtml,
  type QuoteProposalData,
} from "../quoteProposal";
import { quoteIdSchema } from "@shared/quotes";

const formatBrl = (amount: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(amount));

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date(value));

export default function QuoteProposalPage() {
  const [, params] = useRoute("/orcamentos/:quoteId/proposta");
  const [, setLocation] = useLocation();
  const [proposal, setProposal] = useState<QuoteProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const quoteId = params?.quoteId ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setProposal(null);

    void (async () => {
      try {
        const parsedQuoteId = quoteIdSchema.parse(quoteId);
        const quote = await quoteRepository.load(parsedQuoteId);
        const definition = await quoteRepository.loadForm(
          quote.request.productVersionId
        );
        if (cancelled) return;

        const product =
          definition.products.find(
            item =>
              item.productVersionId === quote.request.productVersionId
          ) ?? null;

        if (!product)
          throw new Error(
            "A versão do produto deste orçamento não está disponível."
          );

        setProposal(buildQuoteProposalData(quote, product));
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar a proposta."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  const printProposal = () => {
    if (!proposal) return;

    const popup = window.open("", "_blank", "width=980,height=860");
    if (!popup) {
      setError(
        "O navegador bloqueou a janela de impressão. Libere pop-ups para este site e tente novamente."
      );
      return;
    }

    popup.opener = null;
    popup.document.open();
    popup.document.write(
      buildQuoteProposalPrintHtml(
        proposal,
        `${window.location.origin}/logo.png`
      )
    );
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 350);
  };

  if (loading)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preparando proposta comercial</CardTitle>
          <CardDescription>
            Carregando o snapshot persistido do orçamento.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  if (error || !proposal)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Não foi possível abrir a proposta</CardTitle>
          <CardDescription>
            {error || "Orçamento não encontrado."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setLocation("/orcamentos")}>
            Voltar para orçamentos
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          className="w-fit gap-2"
          onClick={() =>
            setLocation(`/orcamentista?quote=${proposal.quoteId}`)
          }
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao orçamento
        </Button>
        <Button className="gap-2" onClick={printProposal}>
          <Printer className="h-4 w-4" />
          Imprimir / Salvar em PDF
        </Button>
      </div>

      <article className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-6 text-slate-900 shadow-sm sm:p-10 lg:p-14">
        <header className="flex flex-col gap-6 border-b-2 border-slate-900 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <img
            src="/logo.png"
            alt="Evolução Comunicação Visual"
            className="max-h-24 w-auto max-w-[260px] object-contain object-left"
          />
          <div className="sm:text-right">
            <h1 className="text-3xl font-bold tracking-tight">
              Proposta Comercial
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Orçamento #{proposal.quoteNumber} · Snapshot v
              {proposal.snapshotVersion}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(proposal.savedAt)}
            </p>
            <Badge variant="outline" className="mt-3">
              {proposal.statusLabel}
            </Badge>
          </div>
        </header>

        <section className="border-b py-8">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.12em]">
            Cliente
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Cliente
              </p>
              <p className="mt-1 font-semibold">{proposal.customerName}</p>
            </div>
            {proposal.customerPhone && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Telefone
                </p>
                <p className="mt-1 font-semibold">{proposal.customerPhone}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Referência
              </p>
              <p className="mt-1 font-semibold">{proposal.title}</p>
            </div>
          </div>
        </section>

        <section className="border-b py-8">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.12em]">
            Produto e especificações
          </h2>
          <h3 className="text-2xl font-bold">{proposal.productName}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Quantidade: {proposal.quantity} · Versão técnica{" "}
            {proposal.productVersionNumber}
          </p>

          {proposal.specs.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 overflow-hidden rounded-lg border sm:grid-cols-2">
              {proposal.specs.map(spec => (
                <div
                  key={spec.label}
                  className="flex justify-between gap-4 border-b p-3 text-sm sm:odd:border-r"
                >
                  <span className="text-slate-500">{spec.label}</span>
                  <strong className="text-right">{spec.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-500">
              Sem especificações adicionais.
            </p>
          )}
        </section>

        <section className="py-8">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.12em]">
            Investimento
          </h2>

          <div className="divide-y">
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-slate-500">Produto</span>
              <strong>{formatBrl(proposal.productPrice)}</strong>
            </div>
            {proposal.installation.requested && (
              <div className="flex justify-between gap-4 py-3 text-sm">
                <span className="text-slate-500">
                  Instalação
                  {proposal.installation.areaM2
                    ? ` · ${proposal.installation.areaM2} m²`
                    : ""}
                </span>
                <strong>{formatBrl(proposal.installation.price)}</strong>
              </div>
            )}
            {proposal.munck.requested && (
              <div className="flex justify-between gap-4 py-3 text-sm">
                <span className="text-slate-500">
                  Caminhão munck
                  {proposal.munck.billedHours
                    ? ` · ${proposal.munck.billedHours}h faturadas`
                    : ""}
                </span>
                <strong>{formatBrl(proposal.munck.price)}</strong>
              </div>
            )}
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-slate-500">
                Subtotal antes da condição financeira
              </span>
              <strong>{formatBrl(proposal.subtotal)}</strong>
            </div>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-slate-500">Condição de pagamento</span>
              <strong>{proposal.installments}x</strong>
            </div>
          </div>

          <div className="mt-7 rounded-xl bg-slate-100 p-6 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Total da proposta
            </p>
            <p className="mt-1 text-4xl font-bold">
              {formatBrl(proposal.total)}
            </p>
          </div>
        </section>

        <footer className="mt-12 border-t pt-5 text-xs leading-relaxed text-slate-500">
          Documento gerado a partir do snapshot persistido do orçamento no
          EvoluSystem. A proposta comercial não exibe custos internos, markup
          ou parâmetros privados de precificação.
        </footer>
      </article>
    </div>
  );
}
