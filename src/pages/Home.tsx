import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { MaterialWithTiers } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Copy, RefreshCw, Calculator } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const [materials, setMaterials] = useState<MaterialWithTiers[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [width, setWidth] = useState<string>(''); 
  const [height, setHeight] = useState<string>(''); 
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
        materialsWithTiers.push({ ...material, tiers: tiersData || [] });
      }
      setMaterials(materialsWithTiers);
    } catch (error: any) {
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  const selectedMaterial = useMemo(() => 
    materials.find(m => m.id === selectedMaterialId), 
  [materials, selectedMaterialId]);

  // Função para tratar a vírgula brasileira e converter para número
  const parseBrazilianNumber = (val: string) => {
    if (!val) return 0;
    const cleanVal = val.replace(',', '.');
    return parseFloat(cleanVal) || 0;
  };

  const calculation = useMemo(() => {
    if (!selectedMaterial || !width || !height || !quantity) return null;

    const w = parseBrazilianNumber(width);
    const h = parseBrazilianNumber(height);
    const qty = parseInt(quantity) || 0;

    if (w === 0 || h === 0 || qty === 0) return null;

    const areaPerItem = (w * h) / 10000;
    const totalArea = areaPerItem * qty;

    let appliedTier = null;
    if (selectedMaterial.tiers && selectedMaterial.tiers.length > 0) {
      appliedTier = selectedMaterial.tiers.find(t => 
        totalArea >= t.min_area && (t.max_area === null || totalArea <= t.max_area)
      );
    }

    const pricePerM2 = appliedTier ? appliedTier.price_per_m2 : 0;
    const rawPrice = totalArea * pricePerM2;
    const finalPrice = Math.max(rawPrice, selectedMaterial.min_price);
    const isMinimumApplied = finalPrice === selectedMaterial.min_price && rawPrice < selectedMaterial.min_price;

    return { width: w, height: h, quantity: qty, totalArea, pricePerM2, finalPrice, isMinimumApplied };
  }, [selectedMaterial, width, height, quantity]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNumber = (val: number) => {
    return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  };

  // O TEXTO QUE SERÁ EXIBIDO E COPIADO
  const budgetSummaryText = useMemo(() => {
    if (!calculation || !selectedMaterial) return "";
    
    return `${selectedMaterial.name} - 
4x0 impressão digital em alta resolução frente color - 
Tamanho: ${formatNumber(calculation.width)} x ${formatNumber(calculation.height)} cm (larg x alt) - 
Acabamentos: corte reto
---------------------------
Quantidade: ${calculation.quantity} un.
Valor Total: ${formatCurrency(calculation.finalPrice)}${calculation.isMinimumApplied ? ' (Mínimo)' : ''}
${observation ? `Observação: ${observation}` : ''}`;
  }, [calculation, selectedMaterial, observation]);

  const clearForm = () => {
    setWidth('');
    setHeight('');
    setQuantity('1');
    setObservation('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-6 space-y-6">
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
                  type="text" 
                  inputMode="decimal"
                  value={width} 
                  onChange={e => setWidth(e.target.value)} 
                  placeholder="0,00"
                  className="h-12 text-lg font-mono-nums"
                />
              </div>
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={height} 
                  onChange={e => setHeight(e.target.value)} 
                  placeholder="0,00"
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

      <div className="lg:col-span-6">
        <Card className="h-full border-border/50 shadow-lg bg-sidebar text-sidebar-foreground flex flex-col">
          <CardHeader className="pb-4 border-b border-sidebar-border/50">
            <CardTitle className="text-sidebar-foreground">Resumo para o Cliente</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 py-6 flex flex-col">
            {!calculation ? (
              <div className="text-center text-sidebar-foreground/50 py-20">
                <p>Preencha os dados ao lado para gerar o resumo.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full space-y-6">
                {/* ÁREA DE TEXTO PRONTA PARA CÓPIA */}
                <div className="bg-sidebar-accent/20 p-4 rounded-lg border border-sidebar-border/50 whitespace-pre-wrap font-sans text-sm leading-relaxed text-sidebar-foreground/90">
                  {budgetSummaryText}
                </div>

                <div className="mt-auto pt-6 border-t border-sidebar-border/50 text-center">
                  <p className="text-sm text-sidebar-foreground/50 mb-1">Total do Pedido</p>
                  <div className="text-5xl font-bold text-sidebar-primary tracking-tight">
                    {formatCurrency(calculation.finalPrice)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-4 bg-sidebar-accent/10 border-t border-sidebar-border/50">
            <Button 
              className="w-full h-14 text-lg bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground font-bold shadow-xl"
              onClick={() => {
                if (calculation) {
                  navigator.clipboard.writeText(budgetSummaryText);
                  toast.success('Resumo completo copiado!');
                }
              }}
              disabled={!calculation}
            >
              <Copy className="mr-2 h-5 w-5" /> Copiar Resumo Profissional
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}