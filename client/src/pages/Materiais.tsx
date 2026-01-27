import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Material, PriceTier, MaterialWithTiers } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit, Save, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

export default function Materiais() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [materials, setMaterials] = useState<MaterialWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tiers, setTiers] = useState<Partial<PriceTier>[]>([{ min_area: 0, max_area: null, price_per_m2: 0 }]);

  useEffect(() => {
    if (!isAdmin) {
      setLocation('/');
      return;
    }
    fetchMaterials();
  }, [isAdmin, setLocation]);

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

  const handleSave = async () => {
    if (!name || !minPrice) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      let materialId = editingId;

      // 1. Save/Update Material
      if (editingId) {
        const { error } = await supabase
          .from('materials')
          .update({ 
            name, 
            min_price: parseFloat(minPrice),
            image_url: imageUrl || null
          })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('materials')
          .insert({ 
            name, 
            min_price: parseFloat(minPrice),
            image_url: imageUrl || null
          })
          .select()
          .single();
        if (error) throw error;
        materialId = data.id;
      }

      // 2. Save Tiers (Delete all and recreate for simplicity in this MVP)
      if (materialId) {
        // Delete existing
        await supabase.from('price_tiers').delete().eq('material_id', materialId);

        // Insert new
        const tiersToInsert = tiers.map(t => ({
          material_id: materialId,
          min_area: t.min_area || 0,
          max_area: t.max_area === 0 ? null : t.max_area, // Handle 0 as null/infinity if user desires, or explicit null
          price_per_m2: t.price_per_m2 || 0
        }));

        const { error: tiersError } = await supabase.from('price_tiers').insert(tiersToInsert);
        if (tiersError) throw tiersError;
      }

      toast.success('Material salvo com sucesso!');
      setIsDialogOpen(false);
      resetForm();
      fetchMaterials();
    } catch (error: any) {
      console.error('Error saving material:', error);
      toast.error('Erro ao salvar material: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este material?')) return;

    try {
      const { error } = await supabase.from('materials').delete().eq('id', id);
      if (error) throw error;
      toast.success('Material excluído');
      fetchMaterials();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setMinPrice('');
    setImageUrl('');
    setTiers([{ min_area: 0, max_area: null, price_per_m2: 0 }]);
  };

  const openEdit = (material: MaterialWithTiers) => {
    setEditingId(material.id);
    setName(material.name);
    setMinPrice(material.min_price.toString());
    setImageUrl(material.image_url || '');
    setTiers(material.tiers.length > 0 ? material.tiers : [{ min_area: 0, max_area: null, price_per_m2: 0 }]);
    setIsDialogOpen(true);
  };

  const addTier = () => {
    setTiers([...tiers, { min_area: 0, max_area: null, price_per_m2: 0 }]);
  };

  const removeTier = (index: number) => {
    const newTiers = [...tiers];
    newTiers.splice(index, 1);
    setTiers(newTiers);
  };

  const updateTier = (index: number, field: keyof PriceTier, value: any) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setTiers(newTiers);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Materiais</h1>
          <p className="text-muted-foreground">Cadastre materiais e configure as faixas de preço.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Material' : 'Novo Material'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Material</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Lona Frontlight" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minPrice">Valor Mínimo (R$)</Label>
                  <Input 
                    id="minPrice" 
                    type="number" 
                    step="0.01" 
                    value={minPrice} 
                    onChange={e => setMinPrice(e.target.value)} 
                    className="font-mono-nums"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="image">URL da Imagem</Label>
                <div className="flex gap-2">
                  <Input 
                    id="image" 
                    value={imageUrl} 
                    onChange={e => setImageUrl(e.target.value)} 
                    placeholder="https://..." 
                  />
                  {imageUrl && (
                    <div className="h-10 w-10 rounded border overflow-hidden flex-shrink-0">
                      <img src={imageUrl} alt="Preview" className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 border rounded-md p-4 bg-secondary/20">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Faixas de Preço</Label>
                  <Button variant="outline" size="sm" onClick={addTier}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Faixa
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2">
                    <div className="col-span-3">Área Mín (m²)</div>
                    <div className="col-span-3">Área Máx (m²)</div>
                    <div className="col-span-4">Preço/m² (R$)</div>
                    <div className="col-span-2"></div>
                  </div>
                  
                  {tiers.map((tier, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={tier.min_area} 
                          onChange={e => updateTier(index, 'min_area', parseFloat(e.target.value))}
                          className="h-8 font-mono-nums"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="∞"
                          value={tier.max_area === null ? '' : tier.max_area} 
                          onChange={e => updateTier(index, 'max_area', e.target.value === '' ? null : parseFloat(e.target.value))}
                          className="h-8 font-mono-nums"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={tier.price_per_m2} 
                          onChange={e => updateTier(index, 'price_per_m2', parseFloat(e.target.value))}
                          className="h-8 font-mono-nums"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTier(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    * Deixe Área Máx em branco para "acima de X m²".
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {materials.map((material) => (
            <Card key={material.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-video w-full bg-secondary/50 relative">
                {material.image_url ? (
                  <img src={material.image_url} alt={material.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-20" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm" onClick={() => openEdit(material)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" className="h-8 w-8 shadow-sm" onClick={() => handleDelete(material.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="flex justify-between items-start">
                  <span>{material.name}</span>
                </CardTitle>
                <CardDescription>
                  Mínimo: R$ {material.min_price.toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">Tabela de Preços</p>
                  {material.tiers.map((tier, idx) => (
                    <div key={idx} className="flex justify-between text-sm border-b border-border/50 last:border-0 py-1">
                      <span className="font-mono-nums text-muted-foreground">
                        {tier.min_area}m² {tier.max_area ? `- ${tier.max_area}m²` : '+'}
                      </span>
                      <span className="font-mono-nums font-medium">
                        R$ {tier.price_per_m2.toFixed(2)}/m²
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
