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
      const { data: materialsData, error } = await supabase.from('materials').select('*').order('name');
      if (error) throw error;

      const materialsWithTiers: MaterialWithTiers[] = [];
      for (const material of materialsData) {
        const { data: tiers } = await supabase.from('price_tiers').select('*').eq('material_id', material.id).order('min_area');
        materialsWithTiers.push({ ...material, tiers: tiers || [] });
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

  // FUNÇÃO MESTRA: Converte "10,5" em 10.5 de forma segura
  const parseValue = (val: string) => {
    if (!val) return 0;
    const normalized = val.replace(',', '.'); 
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const calculation = useMemo(() => {
    if (!selectedMaterial) return null;

    const w = parseValue(width);
    const h = parseValue(height);
    const qty = parseInt(quantity) || 0;

    if (w <= 0 || h <= 0 || qty <= 0) return null;

    // Área em m²: (Largura cm * Altura cm) / 10.000
    const totalArea = ((w * h) / 10000) * qty;

    let appliedTier = null;
    if (selectedMaterial.tiers && selectedMaterial.tiers.length > 0) {
      appliedTier = selectedMaterial.tiers.find(t => 
        totalArea >= t.min_area && (t.max_area === null || totalArea <= t.max_area)
      );
    }

    const pricePerM2 = appliedTier ? appliedTier.price_per_m2 : 0;
    const rawPrice = totalArea * pricePerM2;
    
    // Valor total respeitando o valor mínimo do material
    const finalPrice = Math.max(rawPrice, selectedMaterial.min_price);
    const isMinimumApplied = finalPrice === selectedMaterial.min_price && rawPrice < selectedMaterial.min_price;

    return { width: w, height: h, quantity: qty, totalArea, pricePerM2, finalPrice, isMinimumApplied };
  }, [selectedMaterial, width, height, quantity]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatNum = (val: number) => {
    return val.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  };

  // O RESUMO EXATAMENTE COMO VOCÊ PEDIU
  const budgetSummaryText = useMemo(() => {
    if (!calculation || !selectedMaterial) return "";
    
    return `${selectedMaterial.name} - 
4x0 impressão digital em alta resolução frente color - 
Tamanho: ${formatNum(calculation.width)} x ${formatNum(calculation.height)} cm (larg x alt) - 
Acabamentos: corte reto
---------------------------
Quantidade: ${calculation.quantity} un.
Valor Total: ${formatCurrency(calculation.finalPrice)}${calculation.isMinimumApplied ? ' (Mínimo Aplicado)' : ''}
${observation ? `\nObservação: ${observation}` : ''}`;
  }, [calculation, selectedMaterial, observation]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-6 space-y-6">
        <Card className="h-full border-border/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary font-bold">
              <Calculator className="h-5 w-5" />
              Evolução - Calculadora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
            <div className="space-y-2">
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger className="h-12 text-lg"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Largura (cm)</Label>
                <Input type="text" value={width} onChange={e => setWidth(e.target.value)} placeholder="0,00" className="h-12 text-lg" />
              </div>
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input type="text" value={height} onChange={e => setHeight(e.target.value)} placeholder="0,00" className="h-12 text-lg" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-12 text-lg" />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Input value={observation} onChange={e => setObservation(e.target.value)} placeholder="Opcional..." />
            </div>
          </CardContent>
          <CardFooter className="border-t bg-secondary/10 p-4">
            <Button variant="ghost" onClick={() => { setWidth(''); setHeight(''); setQuantity('1'); setObservation(''); }} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="lg:col-span-6">
        <Card className="h-full border-border/50 shadow-lg bg-sidebar text-sidebar-foreground flex flex-col">
          <CardHeader className="border-b border-sidebar-border/50">
            <CardTitle>Resumo do Orçamento</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 py-6 flex flex-col">
            {!calculation ? (
              <div className="text-center text-sidebar-foreground/50 py-20 italic">Aguardando dados...</div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="bg-white/10 p-4 rounded-lg border border-white/10 whitespace-pre-wrap font-sans text-sm leading-relaxed mb-6">
                  {budgetSummaryText}
                </div>
                <div className="mt-auto text-center border-t border-white/10 pt-6">
                  <p className="text-sm opacity-50 mb-1">Total Geral</p>
                  <div className="text-5xl font-bold text-sidebar-primary tracking-tighter">
                    {formatCurrency(calculation.finalPrice)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-4 bg-sidebar-accent/10 border-t border-sidebar-border/50">
            <Button className="w-full h-14 text-lg font-bold" onClick={() => { navigator.clipboard.writeText(budgetSummaryText); toast.success('Copiado!'); }} disabled={!calculation}>
              <Copy className="mr-2 h-5 w-5" /> Copiar para o Cliente
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}