import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MaterialWithTiers, PriceTier } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit, Save, X, Image as ImageIcon, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Badge } from '@/components/ui/badge';

export default function Materiais() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [materials, setMaterials] = useState<MaterialWithTiers[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
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
          max_area: t.max_area === 0 ? null : t.max_area,
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

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Materiais</h1>
          <p className="text-muted-foreground">Cadastre e gerencie os materiais e seus preços.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open: boolean) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Novo Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Material' : 'Novo Material'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Material</Label>
                    <Input id="name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Ex: Lona Frontlight" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minPrice">Valor Mínimo (R$)</Label>
                    <Input 
                      id="minPrice" 
                      type="number" 
                      step="0.01" 
                      value={minPrice} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinPrice(e.target.value)} 
                      className="font-mono-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image">URL da Imagem</Label>
                    <Input 
                      id="image" 
                      value={imageUrl} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)} 
                      placeholder="https://..." 
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-center bg-secondary/20 rounded-lg border border-dashed border-border p-4 h-full min-h-[150px]">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="max-h-[200px] object-contain rounded-md" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <span className="text-sm">Preview da Imagem</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 border rounded-md p-4 bg-secondary/10">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <span className="bg-primary/10 text-primary p-1 rounded"><Search className="h-4 w-4" /></span>
                    Faixas de Preço (Tiered Pricing)
                  </Label>
                  <Button variant="outline" size="sm" onClick={addTier}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Faixa
                  </Button>
                </div>
                
                <div className="rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Mín (m²)</TableHead>
                        <TableHead className="w-[100px]">Máx (m²)</TableHead>
                        <TableHead>Preço/m² (R$)</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tiers.map((tier, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input 
                              type="number" 
                              step="0.01" 
                              value={tier.min_area} 
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTier(index, 'min_area', parseFloat(e.target.value))}
                              className="h-8 font-mono-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="∞"
                              value={tier.max_area === null ? '' : tier.max_area} 
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTier(index, 'max_area', e.target.value === '' ? null : parseFloat(e.target.value))}
                              className="h-8 font-mono-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              step="0.01" 
                              value={tier.price_per_m2} 
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateTier(index, 'price_per_m2', parseFloat(e.target.value))}
                              className="h-8 font-mono-nums"
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeTier(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground px-1">
                  * Deixe o campo "Máx" em branco para indicar "acima de X m²".
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" /> Salvar Material
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center py-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar materiais..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="rounded-md border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Imagem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Valor Mínimo</TableHead>
                <TableHead>Faixas de Preço</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum material encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell>
                      <div className="h-10 w-10 rounded bg-secondary/50 overflow-hidden flex items-center justify-center">
                        {material.image_url ? (
                          <img src={material.image_url} alt={material.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell className="font-mono-nums">
                      R$ {material.min_price.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {material.tiers.length > 0 ? (
                          material.tiers.slice(0, 3).map((tier: PriceTier, idx: number) => (
                            <Badge key={idx} variant="secondary" className="font-mono-nums text-xs font-normal">
                              {tier.min_area}-{tier.max_area || '∞'}m²: R${tier.price_per_m2}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem faixas</span>
                        )}
                        {material.tiers.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{material.tiers.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(material)}>
                          <Edit className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(material.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
