import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, Link as LinkIcon, Download, Pencil, Trash2 } from 'lucide-react';

const PAGE_SIZE = 36;
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;
const NO_MATERIAL_VALUE = 'no-material';

type MaterialOption = {
  id: string;
  name: string;
};

type PortfolioPhoto = {
  id: string;
  material_id: string | null;
  material_name: string | null;
  caption: string;
  tags: string[];
  original_path: string;
  thumb_path: string | null;
  created_at: string;
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'sem-material';

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const createWebp = async (file: File, maxSize: number) => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não disponível');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar webp'))), 'image/webp', 0.82);
  });
};

export default function Galeria() {
  const { user, isAdmin } = useAuth();
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<PortfolioPhoto | null>(null);
  const [originalUrl, setOriginalUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [tagsFilter, setTagsFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('all');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMaterialId, setUploadMaterialId] = useState(NO_MATERIAL_VALUE);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [editCaption, setEditCaption] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editMaterialId, setEditMaterialId] = useState(NO_MATERIAL_VALUE);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchMaterials = async () => {
    const { data, error } = await supabase.from('materials').select('id,name').order('name');
    if (error) {
      console.error(error);
      return;
    }
    setMaterials(data ?? []);
  };

  const fetchPhotos = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setPage(0);
      } else {
        setLoadingMore(true);
      }

      const tagsArray = parseTags(tagsFilter);
      const offset = reset ? 0 : page * PAGE_SIZE;

      let query = supabase
        .from('portfolio_photos')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (materialFilter !== 'all') {
        query = query.eq('material_id', materialFilter);
      }

      if (search.trim()) {
        const term = search.trim();
        query = query.or(`caption.ilike.%${term}%,tags.cs.{${term}}`);
      }

      if (tagsArray.length > 0) {
        query = query.contains('tags', tagsArray);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const incoming = (data ?? []) as PortfolioPhoto[];
      setTotalCount(count ?? null);

      setPhotos((prev) => (reset ? incoming : [...prev, ...incoming]));

      const paths = incoming
        .map((item) => item.thumb_path ?? item.original_path)
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        const { data: signed, error: signedError } = await supabase
          .storage
          .from('portfolio')
          .createSignedUrls(paths, SIGNED_URL_TTL);

        if (signedError) throw signedError;

        const urlMap = signed?.reduce<Record<string, string>>((acc, item) => {
          if (item.signedUrl) acc[item.path] = item.signedUrl;
          return acc;
        }, {}) ?? {};

        setThumbUrls((prev) => ({ ...prev, ...urlMap }));
      }

      if (reset) {
        setPage(1);
      } else {
        setPage((prev) => prev + 1);
      }
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar a galeria.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  useEffect(() => {
    fetchPhotos(true);
  }, [search, tagsFilter, materialFilter]);

  const hasMore = useMemo(() => {
    if (totalCount === null) return true;
    return photos.length < totalCount;
  }, [photos.length, totalCount]);

  const resolveMaterialId = (value: string) => (value === NO_MATERIAL_VALUE ? null : value);

  const handleOpenPhoto = async (photo: PortfolioPhoto) => {
    setSelectedPhoto(photo);
    setEditCaption(photo.caption);
    setEditTags(photo.tags.join(', '));
    setEditMaterialId(photo.material_id ?? NO_MATERIAL_VALUE);
    try {
      const { data, error } = await supabase.storage
        .from('portfolio')
        .createSignedUrl(photo.original_path, SIGNED_URL_TTL);
      if (error) throw error;
      setOriginalUrl(data.signedUrl);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar link compartilhável.');
    }
  };

  const handleCopyLink = async () => {
    if (!originalUrl) return;
    await navigator.clipboard.writeText(originalUrl);
    toast.success('Link compartilhável copiado!');
  };

  const handleCopyDescription = async () => {
    if (!selectedPhoto) return;
    const tagsText = selectedPhoto.tags.length ? `Tags: ${selectedPhoto.tags.join(', ')}` : '';
    const text = [selectedPhoto.caption, tagsText].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success('Descrição copiada!');
  };

  const handleOpenOriginal = () => {
    if (!originalUrl) return;
    window.open(originalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleUpload = async () => {
    if (!isAdmin) return;
    if (!uploadFiles.length || !uploadCaption.trim()) {
      toast.error('Adicione descrição e fotos para upload.');
      return;
    }

    try {
      setUploading(true);
      const resolvedMaterialId = resolveMaterialId(uploadMaterialId);
      const material = materials.find((item) => item.id === resolvedMaterialId);
      const materialName = material?.name ?? '';
      const materialSlug = slugify(materialName || 'sem-material');
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const tags = parseTags(uploadTags);

      for (const file of uploadFiles) {
        const uuid = crypto.randomUUID();
        const originalPath = `portfolio/original/${materialSlug}/${year}/${month}/${uuid}.webp`;
        const thumbPath = `portfolio/thumb/${materialSlug}/${year}/${month}/${uuid}.webp`;

        const originalBlob = await createWebp(file, 2000);
        const thumbBlob = await createWebp(file, 480);

        const { error: originalError } = await supabase.storage
          .from('portfolio')
          .upload(originalPath, originalBlob, { contentType: 'image/webp' });
        if (originalError) throw originalError;

        const { error: thumbError } = await supabase.storage
          .from('portfolio')
          .upload(thumbPath, thumbBlob, { contentType: 'image/webp' });
        if (thumbError) throw thumbError;

        const { error: insertError } = await supabase.from('portfolio_photos').insert({
          material_id: resolvedMaterialId,
          material_name: materialName || null,
          caption: uploadCaption,
          tags,
          original_path: originalPath,
          thumb_path: thumbPath,
          created_by: user?.id ?? null,
        });
        if (insertError) throw insertError;
      }

      toast.success('Uploads concluídos!');
      setUploadFiles([]);
      setUploadCaption('');
      setUploadTags('');
      setUploadMaterialId(NO_MATERIAL_VALUE);
      setUploadOpen(false);
      fetchPhotos(true);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar fotos.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedPhoto) return;
    try {
      setSavingEdit(true);
      const tags = parseTags(editTags);
      const resolvedMaterialId = resolveMaterialId(editMaterialId);
      const material = materials.find((item) => item.id === resolvedMaterialId);
      const { error } = await supabase
        .from('portfolio_photos')
        .update({
          caption: editCaption,
          tags,
          material_id: resolvedMaterialId,
          material_name: material?.name ?? null,
        })
        .eq('id', selectedPhoto.id);

      if (error) throw error;
      toast.success('Foto atualizada.');
      setSelectedPhoto({
        ...selectedPhoto,
        caption: editCaption,
        tags,
        material_id: resolvedMaterialId,
        material_name: material?.name ?? null,
      });
      fetchPhotos(true);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPhoto) return;
    try {
      const { error: storageError } = await supabase.storage
        .from('portfolio')
        .remove([selectedPhoto.original_path, selectedPhoto.thumb_path].filter(Boolean) as string[]);
      if (storageError) throw storageError;

      const { error } = await supabase.from('portfolio_photos').delete().eq('id', selectedPhoto.id);
      if (error) throw error;

      toast.success('Foto removida.');
      setSelectedPhoto(null);
      setOriginalUrl('');
      fetchPhotos(true);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao remover foto.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Galeria de Referências</h1>
          <p className="text-sm text-muted-foreground">
            Busque fotos de serviços concluídos para compartilhar com clientes.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" /> Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Upload de fotos</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Material</Label>
                    <Select value={uploadMaterialId} onValueChange={setUploadMaterialId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MATERIAL_VALUE}>Sem material</SelectItem>
                        {materials.map((material) => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Tags</Label>
                    <Input
                      value={uploadTags}
                      onChange={(event) => setUploadTags(event.target.value)}
                      placeholder="adesivo, vitrine, externo"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Fotos</Label>
                  <Input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                  />
                  {uploadFiles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {uploadFiles.length} arquivo(s) selecionado(s).
                    </p>
                  )}
                </div>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar fotos
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Input
          placeholder="Buscar por descrição ou tag"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-[240px]"
        />
        <Input
          placeholder="Tags (separadas por vírgula)"
          value={tagsFilter}
          onChange={(event) => setTagsFilter(event.target.value)}
          className="min-w-[220px]"
        />
        <Select value={materialFilter} onValueChange={setMaterialFilter}>
          <SelectTrigger className="min-w-[220px]">
            <SelectValue placeholder="Filtrar por material" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os materiais</SelectItem>
            {materials.map((material) => (
              <SelectItem key={material.id} value={material.id}>
                {material.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando fotos...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.map((photo) => {
            const previewPath = photo.thumb_path ?? photo.original_path;
            const previewUrl = thumbUrls[previewPath];
            const materialLabel = photo.material_name ?? materials.find((m) => m.id === photo.material_id)?.name;
            return (
              <Card key={photo.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleOpenPhoto(photo)}
                  className="flex h-full w-full flex-col text-left"
                >
                  <div className="aspect-[4/3] w-full bg-muted">
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt={photo.caption}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <div>
                      <p className="text-sm font-medium line-clamp-2">{photo.caption}</p>
                      <p className="text-xs text-muted-foreground">
                        {materialLabel ?? 'Sem material'} • {new Date(photo.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {photo.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {photo.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && !loading && (
        <Button variant="outline" onClick={() => fetchPhotos()} disabled={loadingMore}>
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </Button>
      )}

      <Dialog
        open={Boolean(selectedPhoto)}
        onOpenChange={() => {
          setSelectedPhoto(null);
          setOriginalUrl('');
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalhes da foto</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
              <div className="space-y-4">
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                  {originalUrl && (
                    <img src={originalUrl} alt={selectedPhoto.caption} className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleCopyLink}>
                    <LinkIcon className="mr-2 h-4 w-4" /> Copiar link compartilhável
                  </Button>
                  <Button variant="outline" onClick={handleCopyDescription}>
                    <Pencil className="mr-2 h-4 w-4" /> Copiar descrição
                  </Button>
                  <Button variant="outline" onClick={handleOpenOriginal}>
                    <Download className="mr-2 h-4 w-4" /> Abrir imagem
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">Material</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPhoto.material_name ?? materials.find((m) => m.id === selectedPhoto.material_id)?.name ?? 'Sem material'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Descrição</p>
                  <p className="text-sm text-muted-foreground">{selectedPhoto.caption}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPhoto.tags.length === 0 && (
                      <span className="text-sm text-muted-foreground">Sem tags</span>
                    )}
                    {selectedPhoto.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold">Data</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(selectedPhoto.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                {isAdmin && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-semibold">Editar</p>
                    <div className="space-y-1">
                      <Label>Material</Label>
                      <Select value={editMaterialId} onValueChange={setEditMaterialId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MATERIAL_VALUE}>Sem material</SelectItem>
                          {materials.map((material) => (
                            <SelectItem key={material.id} value={material.id}>
                              {material.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Descrição</Label>
                      <Textarea value={editCaption} onChange={(event) => setEditCaption(event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tags</Label>
                      <Input value={editTags} onChange={(event) => setEditTags(event.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSaveEdit} disabled={savingEdit}>
                        Salvar alterações
                      </Button>
                      <Button variant="destructive" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
