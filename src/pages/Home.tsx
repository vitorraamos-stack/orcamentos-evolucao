import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { MaterialWithTiers } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Copy, RefreshCw, Calculator, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const [materials, setMaterials] = useState<MaterialWithTiers[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculator State
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [width, setWidth] = useState<string>(''); // in cm
  const [height, setHeight] = useState<string>(''); // in cm
  const [quantity, setQuantity] = useState<string>('1');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const { data: materialsData, error: materialsError } = await supabase
        .from('materials')
        .select('*')
        .order('name');

      if (materialsError) throw materialsError;

      const materialsWithTiers: MaterialWithTiers[] = [];

      for (const material of materialsData) {
        const { data: tiersData, error: tiersError } = await supabase
          .from('price_tiers')
          .select('*')
          .eq('material_id', material.id)
          .order('min_area');

        if (tiersError) throw tiersError;

        materialsWithTiers.push({
          ...material,
          tiers: tiersData || []
        });
      }

      setMaterials(materialsWithTiers);
    } catch (error: any) {
      console.error('Error fetching materials:', error);
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  const selectedMaterial = useMemo(() => 
    materials.find(m => m.id === selectedMaterialId), 
  [materials, selectedMaterialId]);

  const calculation = useMemo(() => {
    if (!selectedMaterial || !width || !height || !quantity) return null;

    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const qty = parseInt(quantity) || 0;

    if (w === 0 || h === 0 || qty === 0) return null;

    // Area in m2
    const areaPerItem = (w * h) / 10000; // cm to m2
    const totalArea = areaPerItem * qty;

    // Find Tier
    // Tiers are ordered by min_area ASC
    // We need to find the tier where totalArea fits
    let appliedTier = null;
    
    // Reverse loop to find the highest matching tier or specific logic
    // Usually: find the first tier where area >= min_area AND (area <= max_area OR max_area is null)
    if (selectedMaterial.tiers && selectedMaterial.tiers.length > 0) {
      appliedTier = selectedMaterial.tiers.find(t => 
        totalArea >= t.min_area && (t.max_area === null || totalArea <= t.max_area)
      );
    }

    const pricePerM2 = appliedTier ? appliedTier.price_per_m2 : 0;
    const rawPrice = totalArea * pricePerM2;
    
    // Apply Minimum Price
    // Minimum price is usually per item or per total? 
    // Usually per total order of that item, but let's assume per total for now based on "Valor Mínimo do material"
    const finalPrice = Math.max(rawPrice, selectedMaterial.min_price);
    const isMinimumApplied = finalPrice === selectedMaterial.min_price && rawPrice < selectedMaterial.min_price;

    return {
      width: w,
      height: h,
      quantity: qty,
      areaPerItem,
      totalArea,
      pricePerM2,
      rawPrice,
      finalPrice,
      isMinimumApplied,
      appliedTier
    };
  }, [selectedMaterial, width, height, quantity]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
  };

  const copyToWhatsapp = () => {
    if (!calculation || !selectedMaterial) return;

    const text = `*Orçamento - Evolução Impressos*
--------------------------------
*Material:* ${selectedMaterial.name}
*Medidas:* ${formatNumber(calculation.width)}cm x ${formatNumber(calculation.height)}cm
*Qtd:* ${calculation.quantity} un.
*Área Total:* ${formatNumber(calculation.totalArea)} m²

*Valor Total:* ${formatCurrency(calculation.finalPrice)}
${calculation.isMinimumApplied ? '_(Valor Mínimo Aplicado)_' : ''}
${observation ? `\n*Obs:* ${observation}` : ''}
--------------------------------`;

    navigator.clipboard.writeText(text);
    toast.success('Orçamento copiado para a área de transferência!');
  };

  const clearForm = () => {
    setWidth('');
    setHeight('');
    setQuantity('1');
    setObservation('');
    // Keep material selected for faster sequential calcs
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      {/* Left Panel: Inputs */}
      <div className="lg:col-span-7 space-y-6">
        <Card className="h-full border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Calculadora de Orçamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
            <div className="space-y-2">
              <Label>Selecione o Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Escolha um material..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="py-3">
                      <span className="font-medium">{m.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Largura (cm)</Label>
                <Input 
                  type="number" 
                  value={width} 
                  onChange={e => setWidth(e.target.value)} 
                  placeholder="0"
                  className="h-12 text-lg font-mono-nums"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input 
                  type="number" 
                  value={height} 
                  onChange={e => setHeight(e.target.value)} 
                  placeholder="0"
                  className="h-12 text-lg font-mono-nums"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input 
                type="number" 
                value={quantity} 
                onChange={e => setQuantity(e.target.value)} 
                placeholder="1"
                className="h-12 text-lg font-mono-nums"
              />
            </div>

            <div className="space-y-2">
              <Label>Observações (Opcional)</Label>
              <Input 
                value={observation} 
                onChange={e => setObservation(e.target.value)} 
                placeholder="Ex: Acabamento em ilhós..."
              />
            </div>
          </CardContent>
          <CardFooter className="border-t bg-secondary/10 p-4">
            <Button variant="ghost" onClick={clearForm} className="ml-auto text-muted-foreground hover:text-foreground">
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar Campos
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Right Panel: Results */}
      <div className="lg:col-span-5">
        <Card className="h-full border-border/50 shadow-lg bg-sidebar text-sidebar-foreground flex flex-col">
          <CardHeader className="pb-4 border-b border-sidebar-border/50">
            <CardTitle className="text-sidebar-foreground">Resumo do Orçamento</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 py-8 flex flex-col justify-center space-y-8">
            {!calculation ? (
              <div className="text-center text-sidebar-foreground/50 py-10">
                <p>Preencha os dados ao lado para calcular.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="text-sm text-sidebar-foreground/70">Material</span>
                    <span className="font-medium text-lg text-right">{selectedMaterial?.name}</span>
                  </div>
                  <Separator className="bg-sidebar-border/50" />
                  
                  <div className="flex justify-between items-end">
                    <span className="text-sm text-sidebar-foreground/70">Dimensões</span>
                    <span className="font-mono-nums text-lg">
                      {formatNumber(calculation.width)} x {formatNumber(calculation.height)} cm
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-end">
                    <span className="text-sm text-sidebar-foreground/70">Área Total ({calculation.quantity} un)</span>
                    <span className="font-mono-nums text-lg">
                      {formatNumber(calculation.totalArea)} m²
                    </span>
                  </div>

                  <div className="flex justify-between items-end">
                    <span className="text-sm text-sidebar-foreground/70">Preço Unitário Aplicado</span>
                    <span className="font-mono-nums text-lg">
                      {formatCurrency(calculation.pricePerM2)}/m²
                    </span>
                  </div>
                </div>

                <div className="mt-auto pt-8 border-t border-sidebar-border/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-lg font-medium">Valor Final</span>
                    {calculation.isMinimumApplied && (
                      <span className="text-xs bg-sidebar-primary/20 text-sidebar-primary px-2 py-1 rounded">
                        Mínimo
                      </span>
                    )}
                  </div>
                  <div className="text-5xl font-bold text-sidebar-primary font-mono-nums tracking-tight">
                    {formatCurrency(calculation.finalPrice)}
                  </div>
                  <p className="text-sm text-sidebar-foreground/50 mt-2 text-right">
                    Valor unitário aprox: {formatCurrency(calculation.finalPrice / calculation.quantity)}
                  </p>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="p-4 bg-sidebar-accent/10 border-t border-sidebar-border/50 flex gap-3">
            <Button 
              className="flex-1 h-12 text-lg bg-green-600 hover:bg-green-700 text-white border-0"
              onClick={copyToWhatsapp}
              disabled={!calculation}
            >
              <MessageCircle className="mr-2 h-5 w-5" /> Copiar WhatsApp
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-12 w-12 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => {
                if (calculation) {
                  const text = `Material: ${selectedMaterial?.name}\nTotal: ${formatCurrency(calculation.finalPrice)}`;
                  navigator.clipboard.writeText(text);
                  toast.success('Resumo simples copiado!');
                }
              }}
              disabled={!calculation}
            >
              <Copy className="h-5 w-5" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
