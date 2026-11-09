import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  AVATAR_BUCKET,
  notifyAvatarUpdated,
  prepareAvatar,
  readAvatarPath,
  useAvatarPhoto,
} from '@/shared/users/avatarPhoto';
import { toast } from 'sonner';

type Props = {
  userId: string;
  displayName: string;
};

export default function UserAvatarEditor({ userId, displayName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const photo = useAvatarPhoto(userId);
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  const onPhotoSelected = async (file: File | undefined) => {
    if (!file) return;
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      const blob = await prepareAvatar(file);
      const oldPath = await readAvatarPath(userId);
      uploadedPath = `${userId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedPath, blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profile_avatars')
        .upsert({ user_id: userId, storage_path: uploadedPath, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

      if (updateError) {
        await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
        uploadedPath = null;
        throw updateError;
      }

      notifyAvatarUpdated(userId);
      toast.success('Foto de perfil atualizada.');
      if (oldPath && oldPath !== uploadedPath && oldPath.startsWith(`${userId}/`)) {
        // Cleanup is best-effort. The new avatar is already saved successfully.
        void supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a foto.');
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    setSaving(true);
    try {
      const path = await readAvatarPath(userId);
      if (!path) return;
      const { error } = await supabase.from('profile_avatars').delete().eq('user_id', userId);
      if (error) throw error;
      notifyAvatarUpdated(userId);
      toast.success('Foto removida.');
      if (path.startsWith(`${userId}/`)) {
        void supabase.storage.from(AVATAR_BUCKET).remove([path]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a foto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex items-center gap-4 rounded-xl border bg-muted/30 p-3" aria-label="Foto de perfil">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#17466F] text-2xl font-bold text-white">
        {photo ? <img src={photo} alt={`Foto de ${displayName}`} className="h-full w-full object-cover" /> : initial}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">Foto de perfil</p>
        <p className="text-xs text-muted-foreground">JPG, PNG ou WebP até 6 MB. Corte quadrado automático.</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Selecionar foto de perfil"
            disabled={saving}
            onChange={(event) => void onPhotoSelected(event.target.files?.[0])}
          />
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => inputRef.current?.click()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            {saving ? 'Salvando...' : 'Escolher foto'}
          </Button>
          {photo && (
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void removePhoto()}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
