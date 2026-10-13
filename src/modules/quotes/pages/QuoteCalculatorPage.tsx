import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calculator,
  CheckCircle2,
  ClipboardCopy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { quoteRepository } from "../repositories/quoteRepository";
import {
  buildTechnicalInputs,
  initialQuoteFields,
  isDimensionField,
  positiveUserDecimal,
  quoteFingerprint,
  type QuoteFieldUnits,
  type QuoteFieldValues,
} from "../quoteForm";
import type { UnitId } from "@shared/calculation-engine/units";
import type {
  OfficialQuotePublicResult,
  OfficialQuoteRequest,
  QuoteFormDefinition,
  QuoteFormProduct,
} from "@shared/quotes";

const formatBrl = (amount: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(amount));

const friendlyError = (error: unknown) => {
  const api = error as Error & { code?: string };
  const messages: Record<string, string> = {
    PAYMENT_TERM_NOT_CONFIGURED:
      "Essa condição de pagamento ainda não está configurada.",
    QUOTE_ADDITIONALS_NOT_CONFIGURED:
      "Instalação e munck ainda não estão configurados.",
    TECHNICAL_INPUT_OUT_OF_RANGE:
      "Um dos valores informados está fora da faixa permitida.",
    MISSING_TECHNICAL_INPUT:
      "Preencha todos os dados técnicos obrigatórios.",
    INVALID_TECHNICAL_INPUT:
      "Revise os dados técnicos informados.",
  };
  return api.code && messages[api.code]
    ? messages[api.code]
    : error instanceof Error
      ? error.message
      : "Não foi possível calcular o preço.";
};

export default function QuoteCalculatorPage() {
  const [definition, setDefinition] = useState<QuoteFormDefinition | null>(null);
  const [productVersionId, setProductVersionId] = useState("");
  const [fieldValues, setFieldValues] = useState<QuoteFieldValues>({});
  const [fieldUnits, setFieldUnits] = useState<QuoteFieldUnits>({});
  const [quantity, setQuantity] = useState("1");
  const [installments, setInstallments] = useState("1");
  const [installationRequested, setInstallationRequested] = useState(false);
  const [munckRequested, setMunckRequested] = useState(false);
  const [munckHours, setMunckHours] = useState("4");
  const [result, setResult] = useState<OfficialQuotePublicResult | null>(null);
  const [calculatedFingerprint, setCalculatedFingerprint] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const product = useMemo(
    () =>
      definition?.products.find(
        item => item.productVersionId === productVersionId
      ) ?? null,
    [definition, productVersionId]
  );

  const resetForProduct = (next: QuoteFormProduct | null) => {
    const initial = initialQuoteFields(next?.inputs ?? []);
    setFieldValues(initial.values);
    setFieldUnits(initial.units);
    setQuantity("1");
    setInstallationRequested(false);
    setMunckRequested(false);
    setMunckHours("4");
    setResult(null);
    setCalculatedFingerprint(null);
  };

  const selectProduct = (
    nextVersionId: string,
    source: QuoteFormDefinition | null = definition
  ) => {
    setProductVersionId(nextVersionId);
    const next =
      source?.products.find(
        item => item.productVersionId === nextVersionId
      ) ?? null;
    resetForProduct(next);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void quoteRepository
      .loadForm()
      .then(loaded => {
        if (cancelled) return;
        setDefinition(loaded);
        setInstallments(String(loaded.availableInstallments[0] ?? 1));
        const first =
          loaded.products.find(item => item.calculationAvailable) ??
          loaded.products[0] ??
          null;
        if (first) selectProduct(first.productVersionId, loaded);
      })
      .catch(error => {
        if (cancelled) return;
        const message = friendlyError(error);
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const buildRequest = (): OfficialQuoteRequest => {
    if (!product) throw new Error("Selecione um produto.");
    if (!product.calculationAvailable)
      throw new Error("Este produto ainda não está liberado para cálculo.");

    const technicalInputs = buildTechnicalInputs(
      product.inputs,
      fieldValues,
      fieldUnits
    );
    const commercialQuantity = positiveUserDecimal(quantity, "Quantidade");
    const installmentNumber = Number(installments);

    if (!definition?.availableInstallments.includes(installmentNumber))
      throw new Error("Selecione uma condição de pagamento disponível.");

    return {
      productVersionId: product.productVersionId,
      request: { commercialQuantity, technicalInputs },
      installments: installmentNumber,
      installation: installationRequested
        ? { requested: true }
        : { requested: false },
      munck: munckRequested
        ? {
            requested: true,
            hours: positiveUserDecimal(munckHours, "Horas de munck"),
          }
        : { requested: false },
    };
  };

  const currentFingerprint = useMemo(() => {
    try {
      return quoteFingerprint(buildRequest());
    } catch {
      return null;
    }
  }, [
    product,
    fieldValues,
    fieldUnits,
    quantity,
    installments,
    installationRequested,
    munckRequested,
    munckHours,
    definition,
  ]);

  const freshResult =
    result !== null &&
    currentFingerprint !== null &&
    currentFingerprint === calculatedFingerprint;

  const calculate = async () => {
    setWorking(true);
    try {
      const request = buildRequest();
      const calculated = await quoteRepository.calculate(request);
      setResult(calculated);
      setCalculatedFingerprint(quoteFingerprint(request));
      toast.success("Preço calculado com os valores oficiais.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const formatInputValue = (
    input: QuoteFormProduct["inputs"][number]
  ): string | null => {
    const raw = fieldValues[input.key];

    if (input.type === "BOOLEAN") return raw === true ? "Sim" : "Não";
    if (typeof raw !== "string" || !raw.trim()) return null;

    if (input.type === "SELECT")
      return (
        input.options.find(option => option.value === raw)?.label ?? raw
      );

    if (input.type === "DECIMAL") {
      const unit = fieldUnits[input.key] ?? input.unit;
      return unit ? raw.trim() + " " + unit : raw.trim();
    }

    return raw.trim();
  };

  const copySummary = async () => {
    if (!result || !product || !freshResult) return;

    const technicalLines = product.inputs.flatMap(input => {
      const value = formatInputValue(input);
      return value === null ? [] : [input.label + ": " + value];
    });

    const lines = [
      "ORÇAMENTISTA INTELIGENTE",
      "Produto: " + product.name,
      ...technicalLines,
      "Quantidade: " + result.commercialQuantity,
      "Pagamento: " + result.installments + "x",
      "Valor do produto: " + formatBrl(result.productSellingPrice.amount),
    ];

    if (result.installation.requested)
      lines.push(
        "Instalação: " + formatBrl(result.installation.price.amount)
      );

    if (result.munck.requested)
      lines.push(
        "Munck: " +
          result.munck.billedHours +
          "h — " +
          formatBrl(result.munck.price.amount)
      );

    lines.push(
      "Subtotal: " + formatBrl(result.subtotalBeforeFinancialRate.amount),
      "TOTAL: " + formatBrl(result.totalSellingPrice.amount)
    );

    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Resumo copiado para cadastrar no Conta Azul.");
  };

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        Carregando Orçamentista...
      </div>
    );

  if (loadError)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Não foi possível abrir o Orçamentista</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );

  if (!definition || definition.products.length === 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Orçamentista Inteligente</CardTitle>
          <CardDescription>
            Nenhum produto com versão e preço oficiais está disponível para
            cálculo.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-5 pb-10">
      <div>
        <p className="text-sm font-medium text-primary">Comercial</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Orçamentista Inteligente
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Monte o serviço, calcule o preço oficial e copie o resumo para
          cadastrar o orçamento no Conta Azul.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Produto e configurações</CardTitle>
              <CardDescription>
                Informe apenas os dados do serviço. Custos e regras comerciais
                permanecem protegidos no servidor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={productVersionId}
                  disabled={working}
                  onValueChange={selectProduct}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {definition.products.map(item => (
                      <SelectItem
                        key={item.productVersionId}
                        value={item.productVersionId}
                        disabled={!item.calculationAvailable}
                      >
                        {item.name}
                        {!item.calculationAvailable ? " · indisponível" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {product && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {product.inputs.map(input => {
                    const dimensional = isDimensionField(input);

                    return (
                      <div className="space-y-2" key={input.id}>
                        <Label>
                          {input.label}
                          {input.required ? " *" : ""}
                        </Label>

                        {input.type === "BOOLEAN" ? (
                          <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2">
                            <Checkbox
                              checked={fieldValues[input.key] === true}
                              disabled={working}
                              onCheckedChange={checked =>
                                setFieldValues(current => ({
                                  ...current,
                                  [input.key]: checked === true,
                                }))
                              }
                            />
                            <span className="text-sm">Sim</span>
                          </label>
                        ) : input.type === "SELECT" ? (
                          <Select
                            value={String(fieldValues[input.key] ?? "")}
                            disabled={working}
                            onValueChange={value =>
                              setFieldValues(current => ({
                                ...current,
                                [input.key]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {input.options.map(option => (
                                <SelectItem
                                  value={option.value}
                                  key={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              value={String(fieldValues[input.key] ?? "")}
                              inputMode={
                                input.type === "DECIMAL" ? "decimal" : "text"
                              }
                              disabled={working}
                              maxLength={
                                input.type === "TEXT"
                                  ? input.maxLength
                                  : undefined
                              }
                              onChange={event =>
                                setFieldValues(current => ({
                                  ...current,
                                  [input.key]: event.target.value,
                                }))
                              }
                            />

                            {input.type === "DECIMAL" && dimensional && (
                              <Select
                                value={String(
                                  fieldUnits[input.key] ?? input.unit
                                )}
                                disabled={working}
                                onValueChange={value =>
                                  setFieldUnits(current => ({
                                    ...current,
                                    [input.key]: value as UnitId,
                                  }))
                                }
                              >
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {["mm", "cm", "m"].map(unit => (
                                    <SelectItem value={unit} key={unit}>
                                      {unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}

                        {input.type === "DECIMAL" &&
                          !dimensional &&
                          input.unit && (
                            <p className="text-xs text-muted-foreground">
                              Unidade: {input.unit}
                            </p>
                          )}

                        {input.description && (
                          <p className="text-xs text-muted-foreground">
                            {input.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 border-t pt-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    value={quantity}
                    inputMode="decimal"
                    disabled={working}
                    onChange={event => setQuantity(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Condição de pagamento</Label>
                  <Select
                    value={installments}
                    disabled={working}
                    onValueChange={setInstallments}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {definition.availableInstallments.map(value => (
                        <SelectItem key={value} value={String(value)}>
                          {value}x
                          {value <= 3 ? " · sem acréscimo" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Instalação e munck</CardTitle>
              <CardDescription>
                Selecione apenas os adicionais necessários. Os valores são
                resolvidos pela configuração oficial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {product?.installationAvailable && (
                <label className="flex items-center gap-3 rounded-lg border p-4">
                  <Checkbox
                    checked={installationRequested}
                    disabled={working}
                    onCheckedChange={checked =>
                      setInstallationRequested(checked === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Incluir instalação
                    </span>
                    <span className="text-xs text-muted-foreground">
                      A faixa é calculada automaticamente conforme o produto.
                    </span>
                  </span>
                </label>
              )}

              {product?.munckAvailable && (
                <div className="rounded-lg border p-4">
                  <label className="flex items-center gap-3">
                    <Checkbox
                      checked={munckRequested}
                      disabled={working}
                      onCheckedChange={checked =>
                        setMunckRequested(checked === true)
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Incluir caminhão munck
                      </span>
                      <span className="text-xs text-muted-foreground">
                        O mínimo faturável é aplicado automaticamente.
                      </span>
                    </span>
                  </label>

                  {munckRequested && (
                    <div className="mt-4 max-w-xs space-y-2">
                      <Label>Horas previstas</Label>
                      <Input
                        value={munckHours}
                        inputMode="decimal"
                        disabled={working}
                        onChange={event => setMunckHours(event.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {!product?.installationAvailable && !product?.munckAvailable && (
                <p className="text-sm text-muted-foreground">
                  Este produto não possui adicionais automáticos disponíveis.
                </p>
              )}
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="gap-2"
            disabled={
              working ||
              !product ||
              !product.calculationAvailable
            }
            onClick={() => void calculate()}
          >
            <Calculator className="h-4 w-4" />
            {working ? "Calculando..." : "Calcular preço"}
          </Button>
        </div>

        <div className="lg:col-span-5">
          <Card className="lg:sticky lg:top-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                Resultado
                {result && freshResult && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Atualizado
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                O valor exibido já considera a política comercial oficial.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {!result ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Preencha os dados e clique em Calcular preço.
                </div>
              ) : !freshResult ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  Os dados foram alterados após o último cálculo. Calcule
                  novamente para atualizar o preço.
                </div>
              ) : (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Produto</span>
                      <span>{formatBrl(result.productSellingPrice.amount)}</span>
                    </div>

                    {result.installation.requested && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Instalação
                        </span>
                        <span>{formatBrl(result.installation.price.amount)}</span>
                      </div>
                    )}

                    {result.munck.requested && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Munck
                          {result.munck.billedHours
                            ? " · " + result.munck.billedHours + "h"
                            : ""}
                        </span>
                        <span>{formatBrl(result.munck.price.amount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between gap-4 border-t pt-3">
                      <span className="text-muted-foreground">
                        Subtotal
                      </span>
                      <span>
                        {formatBrl(
                          result.subtotalBeforeFinancialRate.amount
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Pagamento</span>
                      <span>{result.installments}x</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-primary/10 p-5 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Total
                    </p>
                    <p className="mt-1 text-4xl font-bold tracking-tight text-primary">
                      {formatBrl(result.totalSellingPrice.amount)}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={!freshResult}
                    onClick={() => void copySummary()}
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Copiar resumo
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Depois, cadastre o orçamento oficial no Conta Azul.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
