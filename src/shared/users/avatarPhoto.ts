import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const AVATAR_BUCKET = 'user-avatars';
export const AVATAR_UPDATED_EVENT = 'evolusystem:avatar-updated';

export type AvatarUpdateEvent = CustomEvent<{ userId: string }>;

// Signed URLs last 30 minutes; refresh our in-memory cache before that deadline.
// Never persist private avatar URLs in localStorage or across sign-outs.
const SIGNED_URL_CACHE_MS = 20 * 60 * 1000;
const NO_PHOTO_CACHE_MS = 30 * 1000;

type AvatarCacheEntry = {
  expiresAt: number;
  signedUrlPromise: Promise<string | null>;
  preloadPromise?: Promise<string | null>;
  readyUrl?: string;
};
const avatarCache = new Map<string, AvatarCacheEntry>();

export function clearAvatarPhotoCache() {
  avatarCache.clear();
}

export function notifyAvatarUpdated(userId: string) {
  avatarCache.delete(userId);
  window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT, { detail: { userId } }));
}

export async function readAvatarPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profile_avatars')
    .select('storage_path')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.storage_path ?? null;
}

async function fetchSignedAvatarUrl(userId: string): Promise<string | null> {
  const path = await readAvatarPath(userId);
  if (!path) return null;
  // Never render a path for another user or a different storage bucket.
  if (!path.startsWith(`${userId}/`)) return null;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 1800);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

function getAvatarEntry(userId: string): AvatarCacheEntry {
  const cached = avatarCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const entry: AvatarCacheEntry = {
    expiresAt: Date.now() + SIGNED_URL_CACHE_MS,
    signedUrlPromise: fetchSignedAvatarUrl(userId),
  };
  avatarCache.set(userId, entry);
  // Share one database lookup and one URL signature across the welcome screen and sidebar.
  void entry.signedUrlPromise.then(
    (url) => {
      if (avatarCache.get(userId) === entry) {
        entry.expiresAt = Date.now() + (url ? SIGNED_URL_CACHE_MS : NO_PHOTO_CACHE_MS);
      }
    },
    () => {
      if (avatarCache.get(userId) === entry) avatarCache.delete(userId);
    },
  );
  return entry;
}

export function signedAvatarUrl(userId: string): Promise<string | null> {
  return getAvatarEntry(userId).signedUrlPromise;
}

export function getReadyAvatarPhotoUrl(userId: string | null | undefined): string | null {
  if (!userId) return null;
  const cached = avatarCache.get(userId);
  return cached && cached.expiresAt > Date.now() ? cached.readyUrl ?? null : null;
}

/** Fetch the signed URL once and preload/decode the image before displaying it. */
export function preloadAvatarPhoto(userId: string): Promise<string | null> {
  const entry = getAvatarEntry(userId);
  if (!entry.preloadPromise) {
    entry.preloadPromise = entry.signedUrlPromise.then(async (url) => {
      if (!url) return null;
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      try {
        await image.decode();
      } catch {
        return null;
      }
      // An upload or sign-out may have invalidated the request while it was in flight.
      if (!image.naturalWidth || avatarCache.get(userId) !== entry) return null;
      entry.readyUrl = url;
      return url;
    });
  }
  return entry.preloadPromise;
}

export function useAvatarPhoto(userId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => getReadyAvatarPhotoUrl(userId));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onAvatarChange = (event: Event) => {
      if ((event as AvatarUpdateEvent).detail.userId === userId) {
        setVersion((value) => value + 1);
      }
    };
    window.addEventListener(AVATAR_UPDATED_EVENT, onAvatarChange);
    return () => window.removeEventListener(AVATAR_UPDATED_EVENT, onAvatarChange);
  }, [userId]);

  useEffect(() => {
    let active = true;
    setUrl(getReadyAvatarPhotoUrl(userId));
    if (!userId) return () => { active = false; };

    void preloadAvatarPhoto(userId)
      .then((nextUrl) => { if (active) setUrl(nextUrl); })
      .catch(() => { if (active) setUrl(null); });

    return () => { active = false; };
  }, [userId, version]);

  return url;
}

/** Resize and crop to a small square, to avoid keeping large originals in Storage. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Selecione uma foto JPG, PNG ou WebP.');
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('A imagem original deve ter até 6 MB.');
  }

  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error('Arquivo de imagem inválido.');
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a foto.');

    const square = Math.min(image.width, image.height);
    const startX = (image.width - square) / 2;
    const startY = (image.height - square) / 2;
    context.drawImage(image, startX, startY, square, square, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });
    if (!blob || blob.type !== 'image/webp' || blob.size > 1024 * 1024) {
      throw new Error('Não foi possível converter a foto para WebP.');
    }
    return blob;
  } finally {
    image.close();
  }
}
