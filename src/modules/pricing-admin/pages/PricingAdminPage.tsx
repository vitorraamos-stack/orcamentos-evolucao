import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { costingRepository, type CostResourceRecord } from "@/modules/costing/repositories/costingRepository";
import { productEngineeringRepository } from "@/modules/product-engineering/repositories/productEngineeringRepository";
import {
  pricingRepository,
  type ProductPricingContext,
} from "@/modules/pricing/repositories/pricingRepository";
import {
  markupToMultiplier,
  multiplierToMarkup,
  nonNegativeAmount,
  percentToRate,
  rateToPercent,
} from "../pricingAdminMath";
import { decimalStringSchema } from "@shared/calculation-engine/decimal";
import type { CostRate } from "@shared/costing/rates";
import { costTimestampSchema } from "@shared/costing/rates";
import type { CostResourceType } from "@shared/costing/resources";
import type { PricingPaymentTerm } from "@shared/pricing";
import type { Product } from "@shared/product-engineering";
import { RefreshCcw, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

const COST_TYPES: CostResourceType[] = [
  "MATERIAL",
  "PROCESS",
  "OUTSOURCED_SERVICE",
  "FIXED_COST",
];

const COST_TYPE_LABEL: Record<CostResourceType, string> = {
  MATERIAL: "Material",
  PROCESS: "Processo",
  OUTSOURCED_SERVICE: "Terceirizado",
  FIXED_COST: "Custo fixo",
};

type ProductRow = {
  product: Product;
  context: ProductPricingContext | null;
};

type CostRow = CostResourceRecord & {
  rates: CostRate[];
  currentRate: CostRate | null;
};

type PaymentRow = {
  installments: number;
  term: PricingPaymentTerm | null;
};

type ApiLikeError = Error & { code?: string; status?: number };

const formatBrl = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

const currentRate = (rates: CostRate[]) =>
  rates.find(rate => rate.effectiveTo === null) ?? null;

export default function PricingAdminPage() {
  const { hubPermissions } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [markupTarget, setMarkupTarget] = useState<ProductRow | null>(null);
  const [markupInput, setMarkupInput] = useState("");
  const [minimumTarget, setMinimumTarget] = useState<ProductRow | null>(null);
  const [minimumInput, setMinimumInput] = useState("");
  const [costTarget, setCostTarget] = useState<CostRow | null>(null);
  const [costInput, setCostInput] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<PaymentRow | null>(null);
  const [paymentInput, setPaymentInput] = useState("");

  const loadAll = async () => {
    setLoading(true);
    try {
      const productList = await productEngineeringRepository.listProducts();
      const productRows = await Promise.all(
        productList.map(async product => {
          try {
            return {
              product,
              context: await pricingRepository.loadProductContext(product.id),
            };
          } catch (error) {
            const apiError = error as ApiLikeError;
            if (
              apiError.status === 404 ||
              apiError.code === "PRODUCT_PRICING_SETTINGS_NOT_FOUND" ||
              apiError.code === "PRICING_PUBLISHED_VERSION_NOT_FOUND"
            )
              return { product, context: null };
            throw error;
          }
        })
      );

      const resourceLists = await Promise.all(
        COST_TYPES.map(type => costingRepository.listCostResources(type))
      );
      const resourceDetails = await Promise.all(
        resourceLists.flat().map(async record => {
          const detail = await costingRepository.loadCostResource(
            record.resource.type,
            record.resource.id
          );
          return {
            ...detail,
            currentRate: currentRate(detail.rates),
          };
        })
      );

      const terms = await Promise.all(
        Array.from({ length: 12 }, (_, index) => index + 1).map(
          async installments => {
            if (installments <= 3)
              return { installments, term: null } satisfies PaymentRow;
            return {
              installments,
              term: await pricingRepository.tryLoadPaymentTerm(installments),
            } satisfies PaymentRow;
          }
        )
      );

      setProducts(productRows);
      setCosts(resourceDetails);
      setPaymentTerms(terms);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as configurações comerciais."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const configuredProducts = useMemo(
    () => products.filter(row => row.context !== null),
    [products]
  );

  const openMarkup = (row: ProductRow) => {
    if (!row.context) return;
    const strategy = row.context.definition.strategy;
    if (strategy.type !== "MARKUP_ON_COST") return;
    setMarkupTarget(row);
    setMarkupInput(markupToMultiplier(strategy.markup));
  };

  const saveMarkup = async () => {
    if (!markupTarget?.context) return;
    setSaving(true);
    try {
      const markup = multiplierToMarkup(markupInput);
      await pricingRepository.publishMarkupChange(markupTarget.context, markup);
      toast.success("Multiplicador atualizado e nova versão publicada.");
      setMarkupTarget(null);
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar markup.");
    } finally {
      setSaving(false);
    }
  };

  const openMinimum = (row: ProductRow) => {
    if (!row.context) return;
    setMinimumTarget(row);
    setMinimumInput(row.context.productSettings.minimumSellingPrice);
  };

  const saveMinimum = async () => {
    if (!minimumTarget?.context) return;
    setSaving(true);
    try {
      const minimumSellingPrice = nonNegativeAmount(minimumInput);
      await pricingRepository.setProductPricing({
        productId: minimumTarget.product.id,
        pricingPolicyId: minimumTarget.context.policy.id,
        minimumSellingPrice,
        expectedRevision: minimumTarget.context.productSettings.revision,
      });
      toast.success("Preço mínimo atualizado.");
      setMinimumTarget(null);
      await loadAll();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar preço mínimo."
      );
    } finally {
      setSaving(false);
    }
  };

  const openCost = (row: CostRow) => {
    setCostTarget(row);
    setCostInput(row.currentRate?.amount ?? "");
  };

  const saveCost = async () => {
    if (!costTarget) return;
    setSaving(true);
    try {
      const amount = decimalStringSchema.parse(nonNegativeAmount(costInput));
      const effectiveFrom = costTimestampSchema.parse(new Date().toISOString());
      await costingRepository.setCurrentCostRate({
        type: costTarget.resource.type,
        resourceId: costTarget.resource.id,
        amount,
        effectiveFrom,
      });
      toast.success("Custo atualizado. O histórico anterior foi preservado.");
      setCostTarget(null);
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar custo.");
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (row: PaymentRow) => {
    if (row.installments <= 3) return;
    setPaymentTarget(row);
    setPaymentInput(row.term ? rateToPercent(row.term.rate) : "");
  };

  const savePayment = async () => {
    if (!paymentTarget) return;
    setSaving(true);
    try {
      const rate = percentToRate(paymentInput);
      await pricingRepository.setPaymentTerm({
        installments: paymentTarget.installments,
        rate,
        expectedRevision: paymentTarget.term?.revision ?? null,
      });
      toast.success(`Taxa de ${paymentTarget.installments}x atualizada.`);
      setPaymentTarget(null);
      await loadAll();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao atualizar parcelamento."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!hubPermissions.isManager) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Preços e Custos</h1>
        <p className="text-sm text-muted-foreground">
          Somente gerentes podem acessar estas configurações.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6" />
            <h1 className="text-3xl font-bold tracking-tight">Preços e Custos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão comercial centralizada. Alterações ficam registradas nas estruturas oficiais de Costing e Pricing.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadAll()} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="products">
        <TabsList className="grid w-full grid-cols-3 md:w-[560px]">
          <TabsTrigger value="products">Produtos e margem</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="payments">Parcelamento</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Política comercial por produto</CardTitle>
              <CardDescription>
                O multiplicador é apresentado no formato usado comercialmente. Ex.: 3,00x corresponde a markup interno de 2,00.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Política</TableHead>
                    <TableHead>Multiplicador</TableHead>
                    <TableHead>Preço mínimo</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : products.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum produto cadastrado.</TableCell></TableRow>
                  ) : products.map(row => {
                    const context = row.context;
                    const strategy = context?.definition.strategy;
                    return (
                      <TableRow key={row.product.id}>
                        <TableCell>
                          <div className="font-medium">{row.product.name}</div>
                          <div className="text-xs text-muted-foreground">{row.product.code}</div>
                        </TableCell>
                        <TableCell>
                          {context ? context.policy.name : <Badge variant="secondary">Não configurado</Badge>}
                        </TableCell>
                        <TableCell>
                          {strategy?.type === "MARKUP_ON_COST"
                            ? `${markupToMultiplier(strategy.markup)}x`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {context ? formatBrl(context.productSettings.minimumSellingPrice) : "—"}
                        </TableCell>
                        <TableCell>
                          {context ? `v${context.definition.version.versionNumber}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {context && (
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openMarkup(row)}>
                                Multiplicador
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openMinimum(row)}>
                                Mínimo
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!loading && configuredProducts.length === 0 && products.length > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Os produtos existem, mas ainda não possuem Pricing publicado.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parâmetros técnicos e serviços adicionais</CardTitle>
              <CardDescription>
                Rendimento de tinta, número padrão de demãos e regras de instalação/munck serão gerenciados na fase 17B. Eles não serão fixados no frontend.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Custos oficiais</CardTitle>
              <CardDescription>
                Ao alterar um custo, o sistema encerra a taxa anterior e cria uma nova vigência, preservando o histórico.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Custo atual</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : costs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum custo cadastrado.</TableCell></TableRow>
                  ) : costs.map(row => (
                    <TableRow key={row.resource.id}>
                      <TableCell>
                        <div className="font-medium">{row.resource.name}</div>
                        <div className="text-xs text-muted-foreground">{row.resource.code}</div>
                      </TableCell>
                      <TableCell>{COST_TYPE_LABEL[row.resource.type]}</TableCell>
                      <TableCell>
                        {row.currentRate ? formatBrl(row.currentRate.amount) : <Badge variant="secondary">Sem taxa</Badge>}
                      </TableCell>
                      <TableCell>{row.resource.costUnit}</TableCell>
                      <TableCell><Badge variant={row.resource.status === "ACTIVE" ? "default" : "secondary"}>{row.resource.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openCost(row)}>
                          Alterar custo
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Taxas de parcelamento</CardTitle>
              <CardDescription>
                De 1x a 3x a taxa é zero por regra do sistema. De 4x a 12x, uma opção só fica disponível para orçamento quando estiver configurada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Taxa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentTerms.map(row => {
                    const systemZero = row.installments <= 3;
                    return (
                      <TableRow key={row.installments}>
                        <TableCell>{row.installments}x</TableCell>
                        <TableCell>
                          {systemZero ? "0%" : row.term ? `${rateToPercent(row.term.rate)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={systemZero || row.term ? "default" : "secondary"}>
                            {systemZero ? "Sem acréscimo" : row.term ? "Configurado" : "Indisponível"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {!systemZero && (
                            <Button variant="outline" size="sm" onClick={() => openPayment(row)}>
                              {row.term ? "Alterar taxa" : "Configurar"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!markupTarget} onOpenChange={open => !open && setMarkupTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar multiplicador</DialogTitle>
            <DialogDescription>
              {markupTarget?.product.name}. A alteração cria e publica uma nova versão da política; a versão anterior permanece no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Multiplicador de venda</label>
            <div className="flex items-center gap-2">
              <Input value={markupInput} onChange={event => setMarkupInput(event.target.value)} inputMode="decimal" />
              <span className="text-sm text-muted-foreground">x custo</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkupTarget(null)}>Cancelar</Button>
            <Button className="gap-2" disabled={saving} onClick={() => void saveMarkup()}>
              <Save className="h-4 w-4" /> {saving ? "Publicando..." : "Salvar e publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!minimumTarget} onOpenChange={open => !open && setMinimumTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar preço mínimo</DialogTitle>
            <DialogDescription>{minimumTarget?.product.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Preço mínimo (R$)</label>
            <Input value={minimumInput} onChange={event => setMinimumInput(event.target.value)} inputMode="decimal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMinimumTarget(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void saveMinimum()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!costTarget} onOpenChange={open => !open && setCostTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar custo</DialogTitle>
            <DialogDescription>
              {costTarget?.resource.name}. A taxa anterior continuará disponível no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Novo custo (R$ por {costTarget?.resource.costUnit})</label>
            <Input value={costInput} onChange={event => setCostInput(event.target.value)} inputMode="decimal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostTarget(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void saveCost()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paymentTarget} onOpenChange={open => !open && setPaymentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Taxa de {paymentTarget?.installments}x</DialogTitle>
            <DialogDescription>
              Informe a taxa percentual cobrada para esta quantidade de parcelas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Taxa (%)</label>
            <Input value={paymentInput} onChange={event => setPaymentInput(event.target.value)} inputMode="decimal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void savePayment()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
