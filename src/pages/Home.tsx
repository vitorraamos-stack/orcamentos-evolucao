import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Copy, RefreshCw, Calculator, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

type Fulfillment = '' | 'instalacao' | 'retirada' | 'entrega';

export default function Home() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [width, setWidth] = useState<string>(''); 
  const [height, setHeight] = useState<string>(''); 
  const [quantity, setQuantity] = useState<string>('1');
  const [observation, setObservation] = useState('');
  const [fulfillment, setFulfillment] = useState<Fulfillment>('');
  const [installationAddress, setInstallationAddress] = useState<string>('');

  useEffect(() => { fetchMaterials(); }, []);

  const fetchMaterials = async () => {
    setLoading(true);
    const { data: mats } = await supabase.from('materials').select('*, tiers:price_tiers(*)').order('name');
    setMaterials(mats || []);
    setLoading(false);
  };

  const selectedMaterial = useMemo(() => materials.find(m => m.id === selectedMaterialId), [materials, selectedMaterialId]);

  const fulfillmentValid =
    fulfillment !== '' && (fulfillment !== 'instalacao' || installationAddress.trim().length > 0);

  const formatTierLabel = (tier: any, unidade: string) => {
    const minArea = parseValue(tier.min_area);
    const maxArea = tier.max_area === null ? null : parseValue(tier.max_area);
    const price = parseValue(tier.price_per_m2);
    const minText = minArea.toLocaleString('pt-BR');
    const priceText = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (maxArea === null) {
      return `Faixa aplicada: acima de ${minText} ${unidade} - ${priceText}`;
    }
    const maxText = maxArea.toLocaleString('pt-BR');
    return `Faixa aplicada: ${minText} a ${maxText} ${unidade} - ${priceText}`;
  };

  // Função para limpar e converter valores brasileiros (vírgula) para floats de cálculo
  const parseValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === '') return 0;
    const clean = val.toString().trim();
    const normalized = clean.includes(',')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean;
    const parsed = parseFloat(normalized.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseDimensionWithUnit = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === '') {
      return { valueCm: 0, unit: 'cm' as 'cm' | 'm' };
    }
    const text = val.toString().trim().toLowerCase();
    const match = text.match(/(-?[\d.,]+)\s*(cm|m)?/);
    const numeric = parseValue(match?.[1] ?? text);
    const unit = (match?.[2] ?? 'cm') as 'cm' | 'm';
    const valueCm = unit === 'm' ? numeric * 100 : numeric;
    return { valueCm, unit };
  };

  const calculation = useMemo(() => {
    if (!selectedMaterial) return null;

    const parsedWidth = parseDimensionWithUnit(width);
    const parsedHeight = parseDimensionWithUnit(height);
    const w = parsedWidth.valueCm;
    const h = parsedHeight.valueCm;
    const qty = parseInt(quantity) || 0;

    if (w <= 0 || h <= 0 || qty <= 0) return null;

    let medidaBase = 0;
    const wMetros = w / 100;
    const hMetros = h / 100;

    // LÓGICA DE CÁLCULO: M2 ou Linear
    if (selectedMaterial.tipo_calculo === 'linear') {
      medidaBase = Math.max(wMetros, hMetros) * qty;
    } else {
      medidaBase = (wMetros * hMetros) * qty;
    }

    // Busca o preço na faixa correta baseado na medida calculada
    let appliedTier = selectedMaterial.tiers?.find((t: any) => {
      const minArea = parseValue(t.min_area);
      const maxArea = t.max_area === null ? null : parseValue(t.max_area);
      return medidaBase >= minArea && (maxArea === null || medidaBase <= maxArea);
    });

    const pricePerUnit = appliedTier ? parseValue(appliedTier.price_per_m2) : 0;
    const finalPrice = medidaBase * pricePerUnit;

    const minPrice = parseValue(selectedMaterial.min_price);
    const isUnderMinimumThreshold = minPrice > 0 && finalPrice > 0 && finalPrice < minPrice;
    const isUnderGeneralMinimum = finalPrice > 0 && finalPrice < 100;
    const unidade = selectedMaterial.tipo_calculo === 'linear' ? 'ml' : 'm²';
    const appliedTierLabel = appliedTier ? formatTierLabel(appliedTier, unidade) : '';

    return { 
      w, h, qty, 
      finalPrice,
      minPrice,
      isUnderMinimumThreshold,
      isUnderGeneralMinimum,
      unidade,
      widthUnit: parsedWidth.unit,
      heightUnit: parsedHeight.unit,
      appliedTierLabel
    };
  }, [selectedMaterial, width, height, quantity]);

  const budgetSummaryText = useMemo(() => {
    if (!calculation || !selectedMaterial) return "";

    const valorFormatado = calculation.finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const descMaterial = selectedMaterial.description || "Descrição não cadastrada";
    
    const widthValue = calculation.widthUnit === 'm' ? calculation.w / 100 : calculation.w;
    const heightValue = calculation.heightUnit === 'm' ? calculation.h / 100 : calculation.h;

    const fulfillmentLabel = fulfillment === 'instalacao'
      ? 'Instalação'
      : fulfillment === 'retirada'
        ? 'Retirada'
        : fulfillment === 'entrega'
          ? 'Entrega'
          : 'Não informado';

    return `${selectedMaterial.name} - 
${descMaterial} - 
Tamanho: ${widthValue.toLocaleString('pt-BR')} ${calculation.widthUnit} x ${heightValue.toLocaleString('pt-BR')} ${calculation.heightUnit} (larg x alt) - 
Acabamentos: corte reto
---------------------------
Quantidade: ${calculation.qty} un.
Logística: ${fulfillmentLabel}
${fulfillment === 'instalacao' ? `Endereço: ${installationAddress.trim() || '-'}` : ''}
Valor Total: ${valorFormatado}`;
  }, [calculation, fulfillment, installationAddress, selectedMaterial]);

  const handleCopySummary = () => {
    if (!calculation || !fulfillmentValid) return;
    const fullText = budgetSummaryText + (observation ? `\nObs: ${observation}` : "");
    navigator.clipboard.writeText(fullText);
    toast.success('Resumo copiado!');
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-10">
      <div className="lg:col-span-6 space-y-4">
        <Card className="h-full flex flex-col shadow-sm border-border/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-primary font-bold"><Calculator className="h-5 w-5"/> Evolução - Calculadora</CardTitle></CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="space-y-1">
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Selecione o produto..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Largura (cm)</Label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={width} 
                  onChange={e => setWidth(e.target.value)} 
                  placeholder="0,00 cm ou 0,00 m" 
                  className="h-12 text-lg" 
                />
              </div>
              <div className="space-y-1">
                <Label>Altura (cm)</Label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={height} 
                  onChange={e => setHeight(e.target.value)} 
                  placeholder="0,00 cm ou 0,00 m" 
                  className="h-12 text-lg" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input 
                type="number" 
                value={quantity} 
                onChange={e => setQuantity(e.target.value)} 
                className="h-12 text-lg" 
              />
            </div>

            <div className="space-y-3">
              <Label>Logística (obrigatório)</Label>
              <RadioGroup
                value={fulfillment}
                onValueChange={(value) => {
                  const nextValue = value as Fulfillment;
                  setFulfillment(nextValue);
                  if (nextValue !== 'instalacao') {
                    setInstallationAddress('');
                  }
                }}
                className="gap-2"
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <RadioGroupItem value="instalacao" />
                  Instalação
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <RadioGroupItem value="retirada" />
                  Retirada
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <RadioGroupItem value="entrega" />
                  Entrega
                </label>
              </RadioGroup>
              {calculation && fulfillment === '' && (
                <p className="text-xs text-destructive">
                  Selecione a logística para liberar o resumo.
                </p>
              )}
            </div>

            {fulfillment === 'instalacao' && (
              <div className="space-y-1">
                <Label>Endereço de instalação (obrigatório)</Label>
                <Textarea
                  value={installationAddress}
                  onChange={(event) => setInstallationAddress(event.target.value)}
                  placeholder="Rua, número, bairro, cidade, ponto de referência…"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Observações do Orçamento</Label>
              <Input 
                value={observation} 
                onChange={e => setObservation(e.target.value)} 
                placeholder="Ex: Refilar e entregar" 
              />
            </div>

            {selectedMaterial?.equivalence_message && (
              <div className="mt-4 p-4 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-600">
                <div className="flex gap-2 items-start">
                  <Info className="h-5 w-5 shrink-0" />
                  <p className="text-sm font-bold leading-tight whitespace-pre-line text-center w-full">
                    {selectedMaterial.equivalence_message}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t bg-secondary/10 p-4">
            <Button
              variant="ghost"
              onClick={() => {
                setWidth('');
                setHeight('');
                setQuantity('1');
                setObservation('');
                setFulfillment('');
                setInstallationAddress('');
              }}
              className="ml-auto text-muted-foreground"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar Tudo
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="lg:col-span-6">
        <Card className="h-full border-border/50 shadow-lg bg-sidebar text-sidebar-foreground flex flex-col">
          <CardHeader className="border-b border-sidebar-border/50"><CardTitle>Resumo do Orçamento</CardTitle></CardHeader>
          <CardContent className="flex-1 py-6 flex flex-col">
            {!calculation ? (
              <div className="text-center text-sidebar-foreground/50 py-20 italic">Informe as medidas acima para ver o preço...</div>
            ) : (
              <div className="flex flex-col h-full space-y-4">
                <div className="bg-white/10 p-4 rounded-lg border border-white/10 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {budgetSummaryText}
                  {observation && `\nObs: ${observation}`}
                </div>

                {calculation.appliedTierLabel && (
                  <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-[11px] font-semibold uppercase leading-tight text-emerald-100">
                    {calculation.appliedTierLabel}
                  </div>
                )}

                {calculation.isUnderMinimumThreshold && (
                  <div className="flex gap-2 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-100 text-[11px] leading-tight items-start">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <p><strong>ATENÇÃO:</strong> Valor abaixo do mínimo do produto ({calculation.minPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Se este for o único item da venda, verifique a liberação com a gestão.</p>
                  </div>
                )}

                <div className="mt-auto text-center border-t border-white/10 pt-6">
                  <p className="text-sm opacity-50 mb-1">Total a cobrar</p>
                  <div className="text-5xl font-bold text-sidebar-primary tracking-tighter">
                    {calculation.finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-4 bg-sidebar-accent/10 border-t border-sidebar-border/50">
            <Button 
              className="w-full h-14 text-lg font-bold" 
              onClick={handleCopySummary}
              disabled={!calculation || !fulfillmentValid}
            >
              <Copy className="mr-2 h-5 w-5" /> Copiar resumo
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
