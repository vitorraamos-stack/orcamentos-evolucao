import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MaterialWithTiers } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit, Save, X, Image as ImageIcon, FileText, AlertTriangle, Ruler } from 'lucide-react';
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
  const [description, setDescription] = useState('');
  const [equivalenceMessage, setEquivalenceMessage] = useState('');
  const [tipoCalculo, setTipoCalculo] = useState('m2'); // 'm2' ou 'linear'
  const [minPrice, setMinPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tiers, setTiers] = useState<any[]>([{ min_area: 0, max_area: null, price_per_m2: 0 }]);

  useEffect(() => {
    if (!isAdmin) { setLocation('/'); return; }
    fetchMaterials();
  }, [isAdmin, setLocation]);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const { data: materialsData, error: materialsError } = await supabase.from('materials').select('*').order('name');
      if (materialsError) throw materialsError;
      const materialsWithTiers: MaterialWithTiers[] = [];
      for (const material of materialsData) {
        const { data: tiersData } = await supabase.from('price_tiers').select('*').eq('material_id', material.id).order('min_area');
        materialsWithTiers.push({ ...material, tiers: tiersData || [] });
      }
      setMaterials(materialsWithTiers);
    } catch (error: any) { toast.error('Erro ao carregar materiais'); }
    finally { setLoading(false); }
  };

  // Função para tratar vírgula e converter para número (Float)
  const parseNum = (val: any) => {
    if (!val) return 0;
    const clean = val.toString().replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const updateTier = (index: number, field: 'min_area' | 'max_area' | 'price_per_m2', value: any) => {
    setTiers((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        // max_area aceita null (infinito)
        if (field === 'max_area' && (value === '' || value === null)) {
          return { ...t, max_area: null };
        }
        return { ...t, [field]: value };
      })
    );
  };


  const handleSave = async () => {
    if (!name || !minPrice) { toast.error('Preencha os campos obrigatórios'); return; }
    try {
      let materialId = editingId;
      const materialData = { 
        name, 
        description, 
        equivalence_message: equivalenceMessage,
        tipo_calculo: tipoCalculo,
        min_price: parseNum(minPrice),
        image_url: imageUrl || null
      };

      if (editingId) {
        const { error } = await supabase.from('materials').update(materialData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('materials').insert(materialData).select().single();
        if (error) throw error;
        materialId = data.id;
      }

      if (materialId) {
        await supabase.from('price_tiers').delete().eq('material_id', materialId);
        const tiersToInsert = tiers.map(t => ({
          material_id: materialId,
          min_area: parseNum(t.min_area),
          max_area: t.max_area === null || t.max_area === '' ? null : parseNum(t.max_area),
          price_per_m2: parseNum(t.price_per_m2)
        }));
        const { error: tiersError } = await supabase.from('price_tiers').insert(tiersToInsert);
        if (tiersError) throw tiersError;
      }

      toast.success('Material salvo com sucesso!');
      setIsDialogOpen(false);
      resetForm();
      fetchMaterials();
    } catch (error: any) { toast.error('Erro ao salvar material'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este material?')) return;
    await supabase.from('materials').delete().eq('id', id);
    fetchMaterials();
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setEquivalenceMessage('');
    setTipoCalculo('m2');
    setMinPrice('');
    setImageUrl('');
    setTiers([{ min_area: 0, max_area: null, price_per_m2: 0 }]);
  };

  const openEdit = (material: any) => {
    setEditingId(material.id);
    setName(material.name);
    setDescription(material.description || '');
    setEquivalenceMessage(material.equivalence_message || '');
    setTipoCalculo(material.tipo_calculo || 'm2');
    setMinPrice(material.min_price.toString().replace('.', ','));
    setImageUrl(material.image_url || '');
    setTiers(material.tiers.length > 0 ? material.tiers.map((t: any) => ({
        ...t,
        price_per_m2: t.price_per_m2.toString().replace('.', ','),
        min_area: t.min_area.toString().replace('.', ','),
        max_area: t.max_area ? t.max_area.toString().replace('.', ',') : null
    })) : [{ min_area: 0, max_area: null, price_per_m2: 0 }]);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Materiais</h1>
          <p className="text-muted-foreground">Configure produtos, preços e avisos de venda.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo Material</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Editar Material' : 'Novo Material'}</DialogTitle></DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label>Nome do Material</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Adesivo Vinil Liso" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Cálculo</Label>
                  <Select value={tipoCalculo} onValueChange={setTipoCalculo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m2">M² (Área)</SelectItem>
                      <SelectItem value="linear">Linear (Maior Medida)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><FileText className="h-4 w-4"/> Descrição no Orçamento</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: 4x0 impressão digital..." />
                </div>
                <div className="space-y-2">
                  <Label>Valor Mínimo (R$)</Label>
                  <Input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0,00" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-red-600 font-bold"><AlertTriangle className="h-4 w-4"/> Aviso de Equivalência</Label>
                <Input 
                  value={equivalenceMessage} 
                  onChange={e => setEquivalenceMessage(e.target.value)} 
                  placeholder="Ex: O preço para este material é o mesmo para..." 
                />
              </div>

              <div className="space-y-4 border rounded-md p-4 bg-secondary/20">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Tabela de Preços ({tipoCalculo === 'm2' ? 'm²' : 'ml'})</Label>
                  <Button variant="outline" size="sm" onClick={() => setTiers([...tiers, { min_area: 0, max_area: null, price_per_m2: 0 }])}><Plus className="h-3 w-3 mr-1" /> Adicionar Faixa</Button>
                </div>
                {tiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <div className="col-span-3"><Input value={tier.min_area} onChange={e => updateTier(index, 'min_area', e.target.value)} placeholder="Mín" /></div>
                    <div className="col-span-3"><Input value={tier.max_area ?? ''} onChange={e => updateTier(index, 'max_area', e.target.value)} placeholder="Máx" /></div>
                    <div className="col-span-4"><Input value={tier.price_per_m2} onChange={e => updateTier(index, 'price_per_m2', e.target.value)} placeholder="R$" /></div>
                    <div className="col-span-2 flex justify-end"><Button variant="ghost" size="icon" onClick={() => { const n = [...tiers]; n.splice(index, 1); setTiers(n); }}><X className="h-4 w-4" /></Button></div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter><Button onClick={handleSave} className="w-full h-12 text-lg font-bold"><Save className="mr-2 h-4 w-4" /> Salvar Material</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {materials.map((m) => (
          <Card key={m.id} className="relative overflow-hidden">
             {m.tipo_calculo === 'linear' && (
              <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold flex items-center gap-1">
                <Ruler className="h-3 w-3" /> LINEAR
              </div>
            )}
            <CardHeader>
              <CardTitle>{m.name}</CardTitle>
              <CardDescription>{m.description || 'Sem descrição'}</CardDescription>
            </CardHeader>
            <CardContent>
              {m.equivalence_message && (
                <div className="text-[10px] bg-red-600 text-white p-2 rounded mb-4 font-bold uppercase leading-tight">
                   {m.equivalence_message}
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => openEdit(m)}><Edit className="h-4 w-4 mr-2" /> Editar</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}