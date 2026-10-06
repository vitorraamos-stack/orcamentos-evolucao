import { useEffect, useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { costingRepository } from "@/modules/costing/repositories/costingRepository";
import { productEngineeringRepository } from "@/modules/product-engineering/repositories/productEngineeringRepository";
import { pricingRepository } from "@/modules/pricing/repositories/pricingRepository";
import { decimalInput, nonNegativeAmount } from "../pricingAdminMath";
import { decimalStringSchema } from "@shared/calculation-engine/decimal";
import type { ProductCostingParameter } from "@shared/costing/productParameters";
import type { PricingInstallationSettings } from "@shared/pricing";
import type { Product } from "@shared/product-engineering";
import { toast } from "sonner";

type ProductParameters = {
  product: Product;
  parameters: ProductCostingParameter[];
};

const formatBrl = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

const formatDecimal = (value: string) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    Number(value)
  );

export default function TechnicalAndInstallationSettings() {
  const [productParameters, setProductParameters] = useState<ProductParameters[]>([]);
  const [installation, setInstallation] = useState<PricingInstallationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [parameterTarget, setParameterTarget] = useState<{
    product: Product;
    parameter: ProductCostingParameter;
  } | null>(null);
  const [parameterValue, setParameterValue] = useState("");

  const [installationOpen, setInstallationOpen] = useState(false);
  const [installationForm, setInstallationForm] = useState({
    tier1MaxAreaM2: "",
    tier1Price: "",
    tier2MaxAreaM2: "",
    tier2Price: "",
    tier3Price: "",
    munckHourlyPrice: "",
    munckMinimumHours: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const products = await productEngineeringRepository.listProducts();
      const rows = await Promise.all(
        products.map(async product => ({
          product,
          parameters: await costingRepository.listProductCostingParameters(product.id),
        }))
      );
      setProductParameters(rows.filter(row => row.parameters.length > 0));
      setInstallation(await pricingRepository.loadInstallationSettings());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar parâmetros e adicionais."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openParameter = (product: Product, parameter: ProductCostingParameter) => {
    setParameterTarget({ product, parameter });
    setParameterValue(parameter.value);
  };

  const saveParameter = async () => {
    if (!parameterTarget) return;
    setSaving(true);
    try {
      const value = decimalStringSchema.parse(decimalInput(parameterValue).toString());
      await costingRepository.setProductCostingParameter({
        productId: parameterTarget.product.id,
        key: parameterTarget.parameter.key,
        value,
        expectedRevision: parameterTarget.parameter.revision,
      });
      toast.success("Parâmetro técnico atualizado.");
      setParameterTarget(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar parâmetro.");
    } finally {
      setSaving(false);
    }
  };

  const openInstallation = () => {
    if (!installation) return;
    setInstallationForm({
      tier1MaxAreaM2: installation.tier1MaxAreaM2,
      tier1Price: installation.tier1Price,
      tier2MaxAreaM2: installation.tier2MaxAreaM2,
      tier2Price: installation.tier2Price,
      tier3Price: installation.tier3Price,
      munckHourlyPrice: installation.munckHourlyPrice,
      munckMinimumHours: installation.munckMinimumHours,
    });
    setInstallationOpen(true);
  };

  const saveInstallation = async () => {
    if (!installation) return;
    setSaving(true);
    try {
      const tier1MaxAreaM2 = decimalInput(installationForm.tier1MaxAreaM2).toString();
      const tier2MaxAreaM2 = decimalInput(installationForm.tier2MaxAreaM2).toString();
      const munckMinimumHours = decimalInput(installationForm.munckMinimumHours).toString();
      if (decimalInput(tier1MaxAreaM2).lte(0) || decimalInput(tier2MaxAreaM2).lte(tier1MaxAreaM2))
        throw new Error("As faixas de área precisam ser positivas e crescentes.");
      if (decimalInput(munckMinimumHours).lte(0))
        throw new Error("O mínimo de horas do munck deve ser maior que zero.");

      await pricingRepository.setInstallationSettings({
        tier1MaxAreaM2,
        tier1Price: nonNegativeAmount(installationForm.tier1Price),
        tier2MaxAreaM2,
        tier2Price: nonNegativeAmount(installationForm.tier2Price),
        tier3Price: nonNegativeAmount(installationForm.tier3Price),
        munckHourlyPrice: nonNegativeAmount(installationForm.munckHourlyPrice),
        munckMinimumHours,
        expectedRevision: installation.revision,
      });
      toast.success("Regras de instalação atualizadas.");
      setInstallationOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar instalação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Parâmetros técnicos do Costing</CardTitle>
          <CardDescription>
            Estes valores são injetados pelo servidor no cálculo oficial e não podem ser alterados pelo consultor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : productParameters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum parâmetro técnico configurado.</p>
          ) : (
            productParameters.map(row => (
              <div key={row.product.id} className="space-y-2">
                <div>
                  <p className="font-semibold">{row.product.name}</p>
                  <p className="text-xs text-muted-foreground">{row.product.code}</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parâmetro</TableHead>
                      <TableHead>Valor atual</TableHead>
                      <TableHead>Faixa permitida</TableHead>
                      <TableHead>Revisão</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.parameters.map(parameter => (
                      <TableRow key={parameter.key}>
                        <TableCell>
                          <div className="font-medium">{parameter.label}</div>
                          <div className="text-xs text-muted-foreground">{parameter.description}</div>
                        </TableCell>
                        <TableCell>
                          {formatDecimal(parameter.value)}{parameter.unit ? ` ${parameter.unit}` : ""}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {parameter.minValue ?? "—"} até {parameter.maxValue ?? "sem limite"}
                        </TableCell>
                        <TableCell>r{parameter.revision}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openParameter(row.product, parameter)}>
                            Alterar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Instalação e munck</CardTitle>
            <CardDescription>
              Regras comerciais globais usadas pelos adicionais do orçamento. O munck é repassado sem markup.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={openInstallation} disabled={!installation || loading}>
            Alterar regras
          </Button>
        </CardHeader>
        <CardContent>
          {!installation ? (
            <Badge variant="secondary">{loading ? "Carregando" : "Não configurado"}</Badge>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Até {formatDecimal(installation.tier1MaxAreaM2)} m²</p>
                <p className="text-lg font-semibold">{formatBrl(installation.tier1Price)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  Acima de {formatDecimal(installation.tier1MaxAreaM2)} até {formatDecimal(installation.tier2MaxAreaM2)} m²
                </p>
                <p className="text-lg font-semibold">{formatBrl(installation.tier2Price)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Acima de {formatDecimal(installation.tier2MaxAreaM2)} m²</p>
                <p className="text-lg font-semibold">{formatBrl(installation.tier3Price)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Munck</p>
                <p className="text-lg font-semibold">{formatBrl(installation.munckHourlyPrice)}/h</p>
                <p className="text-xs text-muted-foreground">mínimo {formatDecimal(installation.munckMinimumHours)} h</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!parameterTarget} onOpenChange={open => !open && setParameterTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar {parameterTarget?.parameter.label}</DialogTitle>
            <DialogDescription>{parameterTarget?.product.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Novo valor{parameterTarget?.parameter.unit ? ` (${parameterTarget.parameter.unit})` : ""}
            </label>
            <Input value={parameterValue} onChange={event => setParameterValue(event.target.value)} inputMode="decimal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParameterTarget(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void saveParameter()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={installationOpen} onOpenChange={setInstallationOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Regras de instalação e munck</DialogTitle>
            <DialogDescription>
              Ajuste faixas e valores. As alterações valem para novos cálculos e ficam auditadas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Limite da faixa 1 (m²)</span>
              <Input value={installationForm.tier1MaxAreaM2} onChange={e => setInstallationForm(v => ({ ...v, tier1MaxAreaM2: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Preço faixa 1 (R$)</span>
              <Input value={installationForm.tier1Price} onChange={e => setInstallationForm(v => ({ ...v, tier1Price: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Limite da faixa 2 (m²)</span>
              <Input value={installationForm.tier2MaxAreaM2} onChange={e => setInstallationForm(v => ({ ...v, tier2MaxAreaM2: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Preço faixa 2 (R$)</span>
              <Input value={installationForm.tier2Price} onChange={e => setInstallationForm(v => ({ ...v, tier2Price: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Preço acima da faixa 2 (R$)</span>
              <Input value={installationForm.tier3Price} onChange={e => setInstallationForm(v => ({ ...v, tier3Price: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span>Munck por hora (R$)</span>
              <Input value={installationForm.munckHourlyPrice} onChange={e => setInstallationForm(v => ({ ...v, munckHourlyPrice: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>Mínimo de horas do munck</span>
              <Input value={installationForm.munckMinimumHours} onChange={e => setInstallationForm(v => ({ ...v, munckMinimumHours: e.target.value }))} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallationOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void saveInstallation()}>
              {saving ? "Salvando..." : "Salvar regras"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
