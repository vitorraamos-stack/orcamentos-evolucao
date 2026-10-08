import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardCopy,
  FilePlus2,
  FileText,
  History,
  Save,
  Send,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createOrderFromQuotePath } from "@/features/hubos/createOrderNavigation";
import {
  quoteRepository,
} from "../repositories/quoteRepository";
import {
  buildTechnicalInputs,
  hydrateQuoteFields,
  initialQuoteFields,
  isDimensionField,
  normalizeUserDecimal,
  positiveUserDecimal,
  quoteEditableStateFingerprint,
  quoteFingerprint,
  type QuoteFieldUnits,
  type QuoteFieldValues,
} from "../quoteForm";
import { decimalFrom } from "@shared/calculation-engine/decimal";
import type { UnitId } from "@shared/calculation-engine/units";
import {
  quoteCommercialDetailsSchema,
  quoteIdSchema,
  quoteNegotiationRequestSchema,
} from "@shared/quotes";
import type {
  OfficialQuotePublicResult,
  OfficialQuoteRequest,
  QuoteFormDefinition,
  QuoteCommercialDetails,
  QuoteFormProduct,
  QuoteHistoryItem,
  QuoteOutcomeReason,
  QuoteOutcomeReasonCode,
  QuoteNegotiationRequest,
  QuoteSavePublicResult,
  QuoteStatus,
} from "@shared/quotes";

const formatBrl = (amount: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(amount));

const OUTCOME_REASON_LABEL: Record<QuoteOutcomeReasonCode, string> = {
  PRICE: "Preço",
  DEADLINE: "Prazo",
  COMPETITOR: "Fechou com concorrente",
  NO_RESPONSE: "Sem retorno do cliente",
  CLIENT_CANCELLED: "Cliente desistiu",
  DUPLICATE: "Orçamento duplicado",
  CREATED_BY_MISTAKE: "Criado por engano",
  SCOPE_CHANGED: "Escopo alterado",
  OTHER: "Outro motivo",
};

const REJECTED_REASON_OPTIONS: QuoteOutcomeReasonCode[] = [
  "PRICE",
  "DEADLINE",
  "COMPETITOR",
  "NO_RESPONSE",
  "CLIENT_CANCELLED",
  "OTHER",
];

const CANCELLED_REASON_OPTIONS: QuoteOutcomeReasonCode[] = [
  "DUPLICATE",
  "CREATED_BY_MISTAKE",
  "SCOPE_CHANGED",
  "OTHER",
];

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  ACCEPTED: "Aceito",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
};

const friendlyError = (error: unknown) => {
  const api = error as Error & { code?: string };
  const messages: Record<string, string> = {
    PAYMENT_TERM_NOT_CONFIGURED: "Essa condição de pagamento ainda não está configurada.",
    QUOTE_ADDITIONALS_NOT_CONFIGURED: "Instalação e munck ainda não estão configurados.",
    QUOTE_REVISION_CONFLICT: "Este orçamento mudou em outra sessão. Atualize antes de salvar novamente.",
    QUOTE_STATE_CONFLICT: "O orçamento não pode ser alterado no status atual.",
    QUOTE_NEGOTIATION_FORBIDDEN: "Apenas gerentes podem ajustar o preço final.",
    INVALID_QUOTE_NEGOTIATION: "Revise o preço final e a justificativa do ajuste.",
    BELOW_MINIMUM_OVERRIDE_NOT_APPLICABLE: "A confirmação de exceção não é necessária para este valor.",
    TECHNICAL_INPUT_OUT_OF_RANGE: "Um dos valores informados está fora da faixa permitida.",
  };
  return api.code && messages[api.code]
    ? messages[api.code]
    : error instanceof Error
      ? error.message
      : "Não foi possível concluir a operação.";
};

const formatHistoryDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const historyTitle = (item: QuoteHistoryItem) => {
  if (item.eventType === "QUOTE_CREATED") return "Orçamento criado";
  if (item.eventType === "SNAPSHOT_APPENDED")
    return `Versão ${item.snapshotVersion} salva`;
  return `${STATUS_LABEL[item.fromStatus!]} → ${STATUS_LABEL[item.toStatus!]}`;
};

const statusVariant = (status: QuoteStatus) => {
  if (status === "ACCEPTED") return "default" as const;
  if (status === "REJECTED" || status === "CANCELLED")
    return "destructive" as const;
  return "secondary" as const;
};

export default function QuoteCalculatorPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { hubPermissions } = useAuth();
  const isManager = hubPermissions.isManager;
  const [definition, setDefinition] = useState<QuoteFormDefinition | null>(null);
  const [productVersionId, setProductVersionId] = useState("");
  const [fieldValues, setFieldValues] = useState<QuoteFieldValues>({});
  const [fieldUnits, setFieldUnits] = useState<QuoteFieldUnits>({});
  const [quantity, setQuantity] = useState("1");
  const [installments, setInstallments] = useState("1");
  const [installationRequested, setInstallationRequested] = useState(false);
  const [munckRequested, setMunckRequested] = useState(false);
  const [munckHours, setMunckHours] = useState("4");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<OfficialQuotePublicResult | null>(null);
  const [calculatedFingerprint, setCalculatedFingerprint] = useState<string | null>(null);
  const [saved, setSaved] = useState<QuoteSavePublicResult | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [managerAdjustment, setManagerAdjustment] = useState(false);
  const [managerFinalPrice, setManagerFinalPrice] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [belowMinimumConfirmOpen, setBelowMinimumConfirmOpen] =
    useState(false);
  const [historyItems, setHistoryItems] = useState<QuoteHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<
    "REJECTED" | "CANCELLED" | null
  >(null);
  const [outcomeReasonCode, setOutcomeReasonCode] =
    useState<QuoteOutcomeReasonCode | null>(null);
  const [outcomeReasonNote, setOutcomeReasonNote] = useState("");

  const product = useMemo(
    () =>
      definition?.products.find(
        item => item.productVersionId === productVersionId
      ) ?? null,
    [definition, productVersionId]
  );

  const managerAdjustedLock =
    saved?.negotiation.pricingMode === "MANAGER_ADJUSTED" && !isManager;
  const editable =
    (!saved || saved.status === "DRAFT") &&
    (product?.calculationAvailable ?? true) &&
    !managerAdjustedLock;

  const resetForProduct = (next: QuoteFormProduct | null) => {
    const initial = initialQuoteFields(next?.inputs ?? []);
    setFieldValues(initial.values);
    setFieldUnits(initial.units);
    setResult(null);
    setCalculatedFingerprint(null);
    setSaved(null);
    setSavedFingerprint(null);
    setInstallationRequested(false);
    setMunckRequested(false);
    setMunckHours("4");
    setManagerAdjustment(false);
    setManagerFinalPrice("");
    setManagerReason("");
    setBelowMinimumConfirmOpen(false);
  };

  const selectProduct = (nextVersionId: string, source = definition) => {
    setProductVersionId(nextVersionId);
    const next =
      source?.products.find(
        item => item.productVersionId === nextVersionId
      ) ?? null;
    resetForProduct(next);
  };

  useEffect(() => {
    let cancelled = false;
    const quoteParam = new URLSearchParams(search).get("quote");

    setLoading(true);
    setLoadError(null);
    setSaved(null);
    setSavedFingerprint(null);
    setResult(null);
    setCalculatedFingerprint(null);
    setProductVersionId("");
    setFieldValues({});
    setFieldUnits({});
    setQuantity("1");
    setInstallments("1");
    setInstallationRequested(false);
    setMunckRequested(false);
    setMunckHours("4");
    setCustomerName("");
    setCustomerPhone("");
    setTitle("");
    setManagerAdjustment(false);
    setManagerFinalPrice("");
    setManagerReason("");
    setBelowMinimumConfirmOpen(false);

    void (async () => {
      try {
        const existing = quoteParam
          ? await quoteRepository.load(quoteIdSchema.parse(quoteParam))
          : null;
        const loaded = await quoteRepository.loadForm(
          existing?.request.productVersionId ?? null
        );
        if (cancelled) return;

        setDefinition(loaded);

        if (existing) {
          const existingProduct =
            loaded.products.find(
              item => item.productVersionId === existing.request.productVersionId
            ) ?? null;
          if (!existingProduct)
            throw new Error(
              "A versão do produto deste orçamento não está disponível."
            );

          const hydrated = hydrateQuoteFields(
            existingProduct.inputs,
            existing.request.request.technicalInputs
          );
          const loadedMunckHours = existing.request.munck.requested
            ? existing.request.munck.hours
            : "4";

          setProductVersionId(existingProduct.productVersionId);
          setFieldValues(hydrated.values);
          setFieldUnits(hydrated.units);
          setQuantity(existing.request.request.commercialQuantity);
          setInstallments(String(existing.request.installments));
          setInstallationRequested(existing.request.installation.requested);
          setMunckRequested(existing.request.munck.requested);
          setMunckHours(loadedMunckHours);
          setCustomerName(existing.commercial.customerName);
          setCustomerPhone(existing.commercial.customerPhone ?? "");
          setTitle(existing.commercial.title);
          setResult(existing.publicResult);
          const adjusted =
            existing.negotiation.pricingMode === "MANAGER_ADJUSTED";
          setManagerAdjustment(adjusted);
          setManagerFinalPrice(
            adjusted ? existing.negotiation.totalSellingPrice.amount : ""
          );
          setManagerReason("");

          const requestFingerprint = quoteFingerprint(existing.request);
          setCalculatedFingerprint(requestFingerprint);
          setSavedFingerprint(
            quoteEditableStateFingerprint({
              productVersionId: existingProduct.productVersionId,
              fieldValues: hydrated.values,
              fieldUnits: hydrated.units,
              quantity: existing.request.request.commercialQuantity,
              installments: String(existing.request.installments),
              installationRequested: existing.request.installation.requested,
              munckRequested: existing.request.munck.requested,
              munckHours: loadedMunckHours,
              commercial: existing.commercial,
            })
          );
          setSaved({
            quoteId: existing.quoteId,
            quoteNumber: existing.quoteNumber,
            status: existing.status,
            revision: existing.revision,
            snapshotId: existing.snapshotId,
            snapshotVersion: existing.snapshotVersion,
            savedAt: existing.savedAt,
            commercial: existing.commercial,
            publicResult: existing.publicResult,
            negotiation: existing.negotiation,
          });
          return;
        }

        const first =
          loaded.products.find(item => item.calculationAvailable) ?? null;
        setProductVersionId(first?.productVersionId ?? "");
        setQuantity("1");
        setInstallments(String(loaded.availableInstallments[0] ?? 1));
        setCustomerName("");
        setCustomerPhone("");
        setTitle("");
        resetForProduct(first);
      } catch (error) {
        if (!cancelled) {
          const message = friendlyError(error);
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    if (!saved) {
      setHistoryItems([]);
      setHistoryLoading(false);
      setHistoryError(null);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    void quoteRepository
      .history(saved.quoteId)
      .then(result => {
        if (!cancelled) setHistoryItems(result.items);
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryItems([]);
          setHistoryError("Não foi possível carregar o histórico.");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [saved?.quoteId, saved?.revision]);

  const buildCommercial = (): QuoteCommercialDetails => {
    const normalized = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      title: title.trim(),
    };
    if (!normalized.customerName) throw new Error("Preencha o cliente.");
    if (!normalized.title) throw new Error("Preencha o título do orçamento.");
    if (normalized.customerPhone && normalized.customerPhone.length < 3)
      throw new Error("Informe um telefone válido.");
    return quoteCommercialDetailsSchema.parse(normalized);
  };

  const buildRequest = (): OfficialQuoteRequest => {
    if (!product) throw new Error("Selecione um produto.");
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

  const normalizedManagerFinalPrice = useMemo(() => {
    if (!managerFinalPrice.trim()) return null;
    try {
      return decimalFrom(normalizeUserDecimal(managerFinalPrice)).toFixed(2);
    } catch {
      return null;
    }
  }, [managerFinalPrice]);

  const buildNegotiation = (
    allowBelowMinimum = false
  ): QuoteNegotiationRequest => {
    if (!isManager || !managerAdjustment)
      return { mode: "OFFICIAL" };

    if (normalizedManagerFinalPrice === null)
      throw new Error("Informe um preço final válido.");
    if (managerReason.trim().length < 5)
      throw new Error("Informe uma justificativa com pelo menos 5 caracteres.");

    return quoteNegotiationRequestSchema.parse({
      mode: "MANAGER_FINAL_PRICE",
      finalAmount: normalizedManagerFinalPrice,
      reason: managerReason.trim(),
      allowBelowMinimum,
    });
  };

  const currentCommercial = {
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim() || null,
    title: title.trim(),
  };
  const currentEditableFingerprint = quoteEditableStateFingerprint({
    productVersionId,
    fieldValues,
    fieldUnits,
    quantity,
    installments,
    installationRequested,
    munckRequested,
    munckHours,
    commercial: currentCommercial,
  });
  const negotiationStateIsCurrent =
    saved === null
      ? !managerAdjustment
      : saved.negotiation.pricingMode === "MANAGER_ADJUSTED"
        ? managerAdjustment &&
          normalizedManagerFinalPrice ===
            saved.negotiation.totalSellingPrice.amount &&
          managerReason.trim() === ""
        : !managerAdjustment;
  const persistedStateIsCurrent =
    saved !== null &&
    savedFingerprint !== null &&
    currentEditableFingerprint === savedFingerprint &&
    negotiationStateIsCurrent;
  const freshResult =
    result !== null &&
    ((saved !== null && persistedStateIsCurrent) ||
      (currentFingerprint !== null &&
        currentFingerprint === calculatedFingerprint));
  const displayedResult =
    saved !== null && persistedStateIsCurrent ? saved.publicResult : result;
  const displayedTotal =
    saved !== null && persistedStateIsCurrent
      ? saved.negotiation.totalSellingPrice.amount
      : displayedResult?.totalSellingPrice.amount ?? null;
  const hasPendingManagerAdjustment =
    isManager &&
    managerAdjustment &&
    (saved === null || !negotiationStateIsCurrent);
  const managerNegotiationReady =
    !isManager ||
    !managerAdjustment ||
    (normalizedManagerFinalPrice !== null &&
      managerReason.trim().length >= 5);

  const calculate = async () => {
    setWorking(true);
    try {
      const request = buildRequest();
      const calculated = await quoteRepository.calculate(request);
      setResult(calculated);
      setCalculatedFingerprint(quoteFingerprint(request));
      toast.success("Orçamento calculado com os valores oficiais.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const save = async (allowBelowMinimum = false) => {
    setWorking(true);
    try {
      const request = buildRequest();
      if (quoteFingerprint(request) !== calculatedFingerprint)
        throw new Error("Recalcule o orçamento antes de salvar.");
      const commercial = buildCommercial();
      const persisted = await quoteRepository.save({
        quoteId: saved?.quoteId ?? null,
        expectedRevision: saved?.revision ?? null,
        commercial,
        negotiation: buildNegotiation(allowBelowMinimum),
        ...request,
      });
      const fingerprint = quoteFingerprint(request);
      setSaved(persisted);
      setSavedFingerprint(
        quoteEditableStateFingerprint({
          productVersionId,
          fieldValues,
          fieldUnits,
          quantity,
          installments,
          installationRequested,
          munckRequested,
          munckHours,
          commercial,
        })
      );
      setResult(persisted.publicResult);
      setCalculatedFingerprint(fingerprint);
      const adjusted =
        persisted.negotiation.pricingMode === "MANAGER_ADJUSTED";
      setManagerAdjustment(adjusted);
      setManagerFinalPrice(
        adjusted ? persisted.negotiation.totalSellingPrice.amount : ""
      );
      setManagerReason("");
      setBelowMinimumConfirmOpen(false);
      const url = new URL(window.location.href);
      url.searchParams.set("quote", persisted.quoteId);
      window.history.replaceState(window.history.state, "", url);
      toast.success(
        saved
          ? `Nova versão salva no orçamento #${persisted.quoteNumber}.`
          : `Orçamento #${persisted.quoteNumber} criado.`
      );
    } catch (error) {
      const api = error as Error & { code?: string };
      if (
        api.code === "BELOW_MINIMUM_OVERRIDE_REQUIRED" &&
        isManager &&
        managerAdjustment &&
        !allowBelowMinimum
      ) {
        setBelowMinimumConfirmOpen(true);
      } else {
        toast.error(friendlyError(error));
      }
    } finally {
      setWorking(false);
    }
  };

  const transition = async (
    targetStatus: QuoteStatus,
    outcomeReason: QuoteOutcomeReason | null = null
  ) => {
    if (!saved) return;
    setWorking(true);
    try {
      const changed = await quoteRepository.transition(
        saved.quoteId,
        saved.revision,
        targetStatus,
        outcomeReason
      );
      setSaved(current =>
        current
          ? {
              ...current,
              status: changed.status,
              revision: changed.revision,
            }
          : current
      );
      setOutcomeTarget(null);
      setOutcomeReasonCode(null);
      setOutcomeReasonNote("");
      toast.success(`Orçamento marcado como ${STATUS_LABEL[targetStatus].toLowerCase()}.`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const openOutcomeDialog = (
    targetStatus: "REJECTED" | "CANCELLED"
  ) => {
    setOutcomeTarget(targetStatus);
    setOutcomeReasonCode(null);
    setOutcomeReasonNote("");
  };

  const outcomeReasonOptions =
    outcomeTarget === "REJECTED"
      ? REJECTED_REASON_OPTIONS
      : CANCELLED_REASON_OPTIONS;

  const outcomeReasonIsValid =
    outcomeReasonCode !== null &&
    (outcomeReasonCode !== "OTHER" ||
      outcomeReasonNote.trim().length >= 5);

  const confirmOutcome = () => {
    if (!outcomeTarget || !outcomeReasonCode || !outcomeReasonIsValid) return;
    void transition(outcomeTarget, {
      code: outcomeReasonCode,
      note: outcomeReasonNote.trim() || null,
    });
  };

  const newQuote = () => {
    const next =
      definition?.products.find(item => item.calculationAvailable) ?? null;
    if (!next) {
      toast.error("Nenhum produto está disponível para um novo orçamento.");
      return;
    }

    setProductVersionId(next.productVersionId);
    setQuantity("1");
    setInstallments(String(definition?.availableInstallments[0] ?? 1));
    setCustomerName("");
    setCustomerPhone("");
    setTitle("");
    resetForProduct(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("quote");
    window.history.replaceState(window.history.state, "", url);
  };

  const copySummary = async () => {
    if (!displayedResult || !product || !freshResult) return;
    const lines = [
      saved && persistedStateIsCurrent
        ? `Orçamento #${saved.quoteNumber}`
        : saved
          ? `Simulação sobre orçamento #${saved.quoteNumber} (não salva)`
          : "Simulação de orçamento",
      `Cliente: ${customerName.trim() || "Não informado"}`,
      `Referência: ${title.trim() || "Sem título"}`,
      `Produto: ${product.name}`,
      `Quantidade: ${displayedResult.commercialQuantity}`,
      `Produto: ${formatBrl(displayedResult.productSellingPrice.amount)}`,
    ];
    if (displayedResult.installation.requested)
      lines.push(`Instalação: ${formatBrl(displayedResult.installation.price.amount)}`);
    if (displayedResult.munck.requested)
      lines.push(
        `Munck: ${displayedResult.munck.billedHours}h — ${formatBrl(displayedResult.munck.price.amount)}`
      );
    lines.push(
      `Pagamento: ${displayedResult.installments}x`,
      `TOTAL: ${formatBrl(displayedTotal ?? displayedResult.totalSellingPrice.amount)}`
    );
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Resumo copiado.");
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
          <CardTitle>Não foi possível abrir o orçamento</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setLocation("/orcamentos")}>
            Voltar para orçamentos
          </Button>
        </CardContent>
      </Card>
    );

  if (!definition || definition.products.length === 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Orçamentista</CardTitle>
          <CardDescription>
            Nenhum produto com versão e preço oficiais está disponível para orçamento.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Comercial</p>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentista</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cálculo oficial com custos, preço mínimo e adicionais resolvidos pelo servidor.
          </p>
        </div>
        {saved && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(saved.status)}>
              {STATUS_LABEL[saved.status]}
            </Badge>
            <span className="text-sm font-semibold">
              Orçamento #{saved.quoteNumber}
            </span>
            <span className="text-xs text-muted-foreground">
              versão {saved.snapshotVersion}
            </span>
            <Button variant="outline" size="sm" onClick={newQuote}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Novo
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          {saved && !product?.calculationAvailable && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              Esta versão do produto não está mais disponível para novo cálculo.
              O orçamento permanece acessível em modo leitura com o snapshot oficial salvo.
            </div>
          )}

          {managerAdjustedLock && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              Este orçamento possui um preço final autorizado por gerente.
              Para preservar essa aprovação, alterações no orçamento precisam ser feitas por um gerente.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cliente e referência</CardTitle>
              <CardDescription>
                Estes dados identificam o orçamento e serão reutilizados na futura OS.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input
                  value={customerName}
                  disabled={!editable || working}
                  maxLength={160}
                  placeholder="Nome ou razão social"
                  onChange={event => setCustomerName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={customerPhone}
                  disabled={!editable || working}
                  maxLength={40}
                  placeholder="Opcional"
                  onChange={event => setCustomerPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Título / referência</Label>
                <Input
                  value={title}
                  disabled={!editable || working}
                  maxLength={200}
                  placeholder="Ex.: Letreiro recepção · Unidade Kobrasol"
                  onChange={event => setTitle(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produto e medidas</CardTitle>
              <CardDescription>
                Os parâmetros internos de custo não são exibidos nem editáveis aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={productVersionId}
                  disabled={!!saved || !editable || working}
                  onValueChange={value => selectProduct(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {definition.products.map(item => (
                      <SelectItem
                        key={item.productVersionId}
                        value={item.productVersionId}
                      >
                        {item.name} · v{item.productVersionNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {product?.inputs.map(input => {
                  if (input.type === "BOOLEAN")
                    return (
                      <label
                        key={input.key}
                        className="flex min-h-20 items-center gap-3 rounded-lg border p-4"
                      >
                        <Checkbox
                          checked={fieldValues[input.key] === true}
                          disabled={!editable || working}
                          onCheckedChange={checked =>
                            setFieldValues(current => ({
                              ...current,
                              [input.key]: checked === true,
                            }))
                          }
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {input.label}
                          </span>
                          {input.description && (
                            <span className="text-xs text-muted-foreground">
                              {input.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );

                  if (input.type === "SELECT")
                    return (
                      <div className="space-y-2" key={input.key}>
                        <Label>{input.label}</Label>
                        <Select
                          value={String(fieldValues[input.key] ?? "")}
                          disabled={!editable || working}
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
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {input.description && (
                          <p className="text-xs text-muted-foreground">
                            {input.description}
                          </p>
                        )}
                      </div>
                    );

                  const dimensional = isDimensionField(input);
                  return (
                    <div className="space-y-2" key={input.key}>
                      <Label>{input.label}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={String(fieldValues[input.key] ?? "")}
                          disabled={!editable || working}
                          inputMode={input.type === "DECIMAL" ? "decimal" : "text"}
                          maxLength={input.type === "TEXT" ? input.maxLength : undefined}
                          placeholder={input.required ? "Obrigatório" : "Opcional"}
                          onChange={event =>
                            setFieldValues(current => ({
                              ...current,
                              [input.key]: event.target.value,
                            }))
                          }
                        />
                        {input.type === "DECIMAL" && dimensional && (
                          <Select
                            value={String(fieldUnits[input.key] ?? input.unit)}
                            disabled={!editable || working}
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
                      {input.type === "DECIMAL" && !dimensional && input.unit && (
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

              <div className="grid grid-cols-1 gap-4 border-t pt-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    value={quantity}
                    inputMode="decimal"
                    disabled={!editable || working}
                    onChange={event => setQuantity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Condição de pagamento</Label>
                  <Select
                    value={installments}
                    disabled={!editable || working}
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
                Os valores são buscados da configuração oficial; você informa apenas o que o serviço exige.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {product?.installationAvailable && (
                <label className="flex items-center gap-3 rounded-lg border p-4">
                  <Checkbox
                    checked={installationRequested}
                    disabled={!editable || working}
                    onCheckedChange={checked =>
                      setInstallationRequested(checked === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Incluir instalação
                    </span>
                    <span className="text-xs text-muted-foreground">
                      A faixa é calculada automaticamente pela área do letreiro.
                    </span>
                  </span>
                </label>
              )}

              {product?.munckAvailable && (
                <div className="rounded-lg border p-4">
                  <label className="flex items-center gap-3">
                    <Checkbox
                      checked={munckRequested}
                      disabled={!editable || working}
                      onCheckedChange={checked =>
                        setMunckRequested(checked === true)
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Incluir caminhão munck
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Pode ser usado com ou sem instalação calculada pelo sistema.
                      </span>
                    </span>
                  </label>
                  {munckRequested && (
                    <div className="mt-4 max-w-xs space-y-2">
                      <Label>Horas previstas</Label>
                      <Input
                        value={munckHours}
                        inputMode="decimal"
                        disabled={!editable || working}
                        onChange={event => setMunckHours(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        O mínimo faturável configurado é aplicado automaticamente.
                      </p>
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

          {isManager && displayedResult && freshResult && editable && (
            <Card>
              <CardHeader>
                <CardTitle>Negociação gerencial</CardTitle>
                <CardDescription>
                  Ajuste o preço final sem alterar o cálculo oficial. O limite interno não é exibido na interface.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-3 rounded-lg border p-4">
                  <Checkbox
                    checked={managerAdjustment}
                    disabled={working}
                    onCheckedChange={checked => {
                      const enabled = checked === true;
                      setManagerAdjustment(enabled);
                      setManagerFinalPrice(
                        enabled
                          ? displayedTotal ??
                              displayedResult.totalSellingPrice.amount
                          : ""
                      );
                      setManagerReason("");
                      setBelowMinimumConfirmOpen(false);
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      Definir preço final manualmente
                    </span>
                    <span className="text-xs text-muted-foreground">
                      O valor oficial continua preservado para auditoria.
                    </span>
                  </span>
                </label>

                {managerAdjustment && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="space-y-2">
                      <Label>Preço final autorizado</Label>
                      <Input
                        value={managerFinalPrice}
                        inputMode="decimal"
                        disabled={working}
                        placeholder="Ex.: 1500,00"
                        onChange={event =>
                          setManagerFinalPrice(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Justificativa do ajuste</Label>
                      <Textarea
                        value={managerReason}
                        disabled={working}
                        maxLength={500}
                        placeholder="Ex.: condição comercial aprovada para fechamento"
                        onChange={event => setManagerReason(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        A justificativa fica registrada internamente e não aparece na proposta do cliente.
                      </p>
                    </div>
                    {normalizedManagerFinalPrice && (
                      <div className="rounded-lg bg-muted p-3 text-sm">
                        <span className="text-muted-foreground">
                          Preço final solicitado:
                        </span>{" "}
                        <strong>
                          {formatBrl(normalizedManagerFinalPrice)}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="gap-2"
              disabled={!editable || working}
              onClick={() => void calculate()}
            >
              <Calculator className="h-4 w-4" />
              {working ? "Processando..." : "Calcular orçamento"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2"
              disabled={
                !editable ||
                working ||
                !freshResult ||
                !managerNegotiationReady
              }
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" />
              {saved ? "Salvar nova versão" : "Salvar orçamento"}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <Card className="lg:sticky lg:top-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                Resultado
                {displayedResult && freshResult && (
                  <Badge variant="outline" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Atualizado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                O total abaixo já respeita a política comercial publicada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!displayedResult ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Preencha os dados e calcule para ver o valor oficial.
                </div>
              ) : (
                <>
                  {!freshResult && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      Os dados foram alterados. Recalcule antes de salvar.
                    </div>
                  )}
                  <div className="space-y-3 rounded-lg border p-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Produto</span>
                      <span className="font-medium">
                        {formatBrl(displayedResult.productSellingPrice.amount)}
                      </span>
                    </div>
                    {displayedResult.installation.requested && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Instalação · {displayedResult.installation.areaM2} m²
                        </span>
                        <span className="font-medium">
                          {formatBrl(displayedResult.installation.price.amount)}
                        </span>
                      </div>
                    )}
                    {displayedResult.munck.requested && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Munck · {displayedResult.munck.billedHours}h faturadas
                        </span>
                        <span className="font-medium">
                          {formatBrl(displayedResult.munck.price.amount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 border-t pt-3">
                      <span className="text-muted-foreground">
                        Subtotal antes do financeiro
                      </span>
                      <span>
                        {formatBrl(displayedResult.subtotalBeforeFinancialRate.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Pagamento</span>
                      <span>{displayedResult.installments}x</span>
                    </div>
                  </div>

                  <div className="rounded-xl bg-primary/10 p-5 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {saved?.negotiation.pricingMode === "MANAGER_ADJUSTED" &&
                      persistedStateIsCurrent
                        ? "Total autorizado"
                        : "Total a cobrar"}
                    </p>
                    <p className="mt-1 text-4xl font-bold tracking-tight text-primary">
                      {formatBrl(
                        displayedTotal ?? displayedResult.totalSellingPrice.amount
                      )}
                    </p>
                    {saved?.negotiation.pricingMode === "MANAGER_ADJUSTED" &&
                      persistedStateIsCurrent && (
                        <Badge variant="secondary" className="mt-3">
                          Ajuste gerencial
                        </Badge>
                      )}
                  </div>

                  {hasPendingManagerAdjustment && normalizedManagerFinalPrice && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      O ajuste de {formatBrl(normalizedManagerFinalPrice)} ainda não foi autorizado no snapshot.
                      Salve a nova versão antes de enviar ou gerar a proposta.
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={!freshResult || hasPendingManagerAdjustment}
                    onClick={() => void copySummary()}
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Copiar resumo
                  </Button>
                </>
              )}

              {saved && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Orçamento #{saved.quoteNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Snapshot v{saved.snapshotVersion} · revisão {saved.revision}
                      </p>
                    </div>
                    <Badge variant={statusVariant(saved.status)}>
                      {STATUS_LABEL[saved.status]}
                    </Badge>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={working || !persistedStateIsCurrent}
                    onClick={() =>
                      setLocation(`/orcamentos/${saved.quoteId}/proposta`)
                    }
                  >
                    <FileText className="h-4 w-4" />
                    Proposta comercial
                  </Button>

                  {saved.status === "DRAFT" && !persistedStateIsCurrent && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      Há alterações não salvas. Salve a versão atual antes de marcar o orçamento como enviado.
                    </div>
                  )}

                  {saved.status === "DRAFT" && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        className="gap-2"
                        disabled={working || !persistedStateIsCurrent}
                        onClick={() => void transition("SENT")}
                      >
                        <Send className="h-4 w-4" />
                        Marcar enviado
                      </Button>
                      <Button
                        variant="outline"
                        disabled={working}
                        onClick={() => openOutcomeDialog("CANCELLED")}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {saved.status === "SENT" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        disabled={working}
                        onClick={() => void transition("DRAFT")}
                      >
                        Reabrir
                      </Button>
                      <Button
                        disabled={working}
                        onClick={() => void transition("ACCEPTED")}
                      >
                        Aceito
                      </Button>
                      <Button
                        variant="outline"
                        disabled={working}
                        onClick={() => openOutcomeDialog("REJECTED")}
                      >
                        Recusado
                      </Button>
                      <Button
                        variant="outline"
                        disabled={working}
                        onClick={() => openOutcomeDialog("CANCELLED")}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}

                  {saved.status === "ACCEPTED" && (
                    <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-emerald-600" />
                        Orçamento aceito. Os dados comerciais estão bloqueados e prontos para o handoff operacional.
                      </div>
                      <Button
                        className="w-full gap-2"
                        disabled={working}
                        onClick={() =>
                          setLocation(
                            createOrderFromQuotePath(
                              saved.quoteId,
                              `/orcamentista?quote=${saved.quoteId}`
                            )
                          )
                        }
                      >
                        <Truck className="h-4 w-4" />
                        Criar OS a partir deste orçamento
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold">Histórico</p>
                        <p className="text-xs text-muted-foreground">
                          Alterações e mudanças de status deste orçamento.
                        </p>
                      </div>
                    </div>

                    {historyLoading && (
                      <p className="text-xs text-muted-foreground">
                        Carregando histórico...
                      </p>
                    )}
                    {historyError && (
                      <p className="text-xs text-destructive">{historyError}</p>
                    )}
                    {!historyLoading &&
                      !historyError &&
                      historyItems.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Nenhum evento registrado.
                        </p>
                      )}

                    {!historyLoading &&
                      !historyError &&
                      historyItems.map(item => (
                        <div
                          key={item.eventId}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{historyTitle(item)}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatHistoryDate(item.occurredAt)}
                                {item.actorEmail
                                  ? ` · ${item.actorEmail}`
                                  : ""}
                              </p>
                            </div>
                            {item.pricingMode === "MANAGER_ADJUSTED" && (
                              <Badge variant="outline" className="text-[10px]">
                                Ajuste gerencial
                              </Badge>
                            )}
                          </div>
                          {item.eventType !== "STATUS_CHANGED" && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Total autorizado:{" "}
                              <span className="font-medium text-foreground">
                                {formatBrl(item.totalSellingPrice.amount)}
                              </span>
                            </p>
                          )}
                          {item.outcomeReason && (
                            <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
                              <span className="font-medium">Motivo: </span>
                              {OUTCOME_REASON_LABEL[item.outcomeReason.code]}
                              {item.outcomeReason.note && (
                                <p className="mt-1 text-muted-foreground">
                                  {item.outcomeReason.note}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog
        open={outcomeTarget !== null}
        onOpenChange={open => {
          if (!open && !working) {
            setOutcomeTarget(null);
            setOutcomeReasonCode(null);
            setOutcomeReasonNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {outcomeTarget === "REJECTED"
                ? "Registrar orçamento recusado"
                : "Cancelar orçamento"}
            </DialogTitle>
            <DialogDescription>
              Registre o motivo para manter o histórico comercial completo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select
                value={outcomeReasonCode ?? ""}
                disabled={working}
                onValueChange={value =>
                  setOutcomeReasonCode(value as QuoteOutcomeReasonCode)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {outcomeReasonOptions.map(code => (
                    <SelectItem key={code} value={code}>
                      {OUTCOME_REASON_LABEL[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                value={outcomeReasonNote}
                disabled={working}
                maxLength={300}
                placeholder={
                  outcomeReasonCode === "OTHER"
                    ? "Descreva o motivo (obrigatório)"
                    : "Opcional"
                }
                onChange={event => setOutcomeReasonNote(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {outcomeReasonNote.length}/300
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => {
                setOutcomeTarget(null);
                setOutcomeReasonCode(null);
                setOutcomeReasonNote("");
              }}
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={working || !outcomeReasonIsValid}
              onClick={confirmOutcome}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={belowMinimumConfirmOpen}
        onOpenChange={setBelowMinimumConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Confirmar exceção comercial
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este preço ficou abaixo do limite comercial protegido. O valor do limite não é exibido.
              Confirme somente se deseja autorizar esta exceção de forma consciente e auditável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>
              Voltar e revisar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={event => {
                event.preventDefault();
                setBelowMinimumConfirmOpen(false);
                void save(true);
              }}
            >
              Autorizar exceção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
