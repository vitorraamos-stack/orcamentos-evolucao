import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MaterialWithTiers } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Calculator, RefreshCw } from 'lucide-react';

export default function Home() {
  const [materials, setMaterials] = useState<MaterialWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Calculator State
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [width, setWidth] = useState(''); // cm
  const [height, setHeight] = useState(''); // cm
  const [quantity, setQuantity] = useState('1');
  
  // Result State
  const [totalArea, setTotalArea] = useState<number>(0);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [appliedTierPrice, setAppliedTierPrice] = useState<number | null>(null);

  useEffect(() => {
    fetchMaterials();
  }, []);

  const parseValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === '') return 0;
    const clean = val.toString().trim();
    const normalized = clean.includes(',')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean;
    const parsed = parseFloat(normalized.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  const parseDimensionToCm = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === '') return 0;
    const text = val.toString().trim().toLowerCase();
    const match = text.match(/(-?[\d.,]+)\s*(cm|m)?/);
    const numeric = parseValue(match?.[1] ?? text);
    const unit = match?.[2] ?? '';
    return unit === 'm' ? numeric * 100 : numeric;
  };

  const fetchMaterials = async () => {
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

  const calculate = () => {
    if (!selectedMaterialId || !width || !height || !quantity) {
      toast.error('Preencha todos os campos');
      return;
    }

    const material = materials.find(m => m.id === selectedMaterialId);
    if (!material) return;

    const w = parseDimensionToCm(width);
    const h = parseDimensionToCm(height);
    const q = parseInt(quantity);

    if (isNaN(w) || isNaN(h) || isNaN(q)) {
      toast.error('Valores inválidos');
      return;
    }

    // Area in m2
    const areaPerItem = (w * h) / 10000; // cm to m2
    const totalAreaCalc = areaPerItem * q;
    setTotalArea(totalAreaCalc);

    // Find Tier
    let pricePerM2 = 0;
    
    // Sort tiers by min_area desc to find the matching range
    // Logic: find the first tier where totalArea >= min_area
    // But we need to handle ranges.
    // Actually, usually tiers are like: 0-3, 3-10, 10+
    // So we look for the tier that covers the totalArea.
    
    const sortedTiers = [...material.tiers].sort(
      (a, b) => parseValue(a.min_area) - parseValue(b.min_area)
    );
    
    const matchingTier = sortedTiers.find(tier => {
      const minArea = parseValue(tier.min_area);
      const maxArea = tier.max_area === null ? null : parseValue(tier.max_area);
      if (maxArea === null) {
        return totalAreaCalc >= minArea;
      }
      return totalAreaCalc >= minArea && totalAreaCalc < maxArea;
    });

    if (matchingTier) {
      pricePerM2 = parseValue(matchingTier.price_per_m2);
      setAppliedTierPrice(pricePerM2);
    } else {
      // Fallback if no tier matches (should not happen if 0-null exists)
      // Or maybe use the highest tier?
      // Let's assume the last one if nothing matches (e.g. area smaller than smallest min_area?)
      // Ideally 0 start covers everything.
      if (sortedTiers.length > 0) {
         // If area is smaller than first tier, use first tier price? Or 0?
         // Let's assume first tier.
         pricePerM2 = parseValue(sortedTiers[0].price_per_m2);
         setAppliedTierPrice(pricePerM2);
      } else {
        pricePerM2 = 0;
        setAppliedTierPrice(null);
      }
    }

    let calculatedPrice = totalAreaCalc * pricePerM2;

    // Apply Minimum Price
    const minPrice = parseValue(material.min_price);
    if (calculatedPrice < minPrice) {
      calculatedPrice = minPrice;
    }

    setTotalPrice(calculatedPrice);
    setUnitPrice(calculatedPrice / q);
  };

  const copyToWhatsapp = () => {
    if (!selectedMaterialId) return;
    const material = materials.find(m => m.id === selectedMaterialId);
    
    const text = `*Orçamento - Evolução Impressos*
    
*Material:* ${material?.name}
*Medidas:* ${width}cm x ${height}cm
*Quantidade:* ${quantity}
*Área Total:* ${totalArea.toFixed(2)}m²

*Valor Total:* R$ ${totalPrice.toFixed(2)}
    
_Gerado em ${new Date().toLocaleDateString()}_`;

    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
  };

  const reset = () => {
    setWidth('');
    setHeight('');
    setQuantity('1');
    setTotalArea(0);
    setTotalPrice(0);
    setUnitPrice(0);
    setAppliedTierPrice(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calculadora de Orçamentos</h1>
        <p className="text-muted-foreground">Calcule rapidamente orçamentos baseados em área e material.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados do Pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um material" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
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
                  placeholder="0 cm ou 0 m"
                  className="font-mono-nums text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={height} 
                  onChange={e => setHeight(e.target.value)} 
                  placeholder="0 cm ou 0 m"
                  className="font-mono-nums text-lg"
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
                className="font-mono-nums text-lg"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Limpar
            </Button>
            <Button onClick={calculate} size="lg" className="px-8">
              <Calculator className="mr-2 h-4 w-4" /> Calcular
            </Button>
          </CardFooter>
        </Card>

        {/* Result Card */}
        <Card className="bg-secondary/20 border-primary/20">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Área Total</span>
              <div className="text-2xl font-mono-nums font-bold">{totalArea.toFixed(2)} m²</div>
            </div>

            {appliedTierPrice !== null && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Preço da Faixa Aplicada</span>
                <div className="text-lg font-mono-nums">R$ {appliedTierPrice.toFixed(2)} /m²</div>
              </div>
            )}

            <div className="pt-4 border-t border-border/50 space-y-1">
              <span className="text-sm text-muted-foreground">Valor Unitário</span>
              <div className="text-xl font-mono-nums font-semibold">R$ {unitPrice.toFixed(2)}</div>
            </div>

            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-sm font-medium text-primary">Valor Total</span>
              <div className="text-4xl font-mono-nums font-bold text-primary">
                R$ {totalPrice.toFixed(2)}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="secondary" onClick={copyToWhatsapp} disabled={totalPrice === 0}>
              <Copy className="mr-2 h-4 w-4" /> Copiar para WhatsApp
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
