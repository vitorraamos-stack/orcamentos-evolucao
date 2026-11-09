import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPath: vi.fn(),
  signUrl: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.readPath() }),
      }),
    }),
    storage: {
      from: () => ({ createSignedUrl: (...args: unknown[]) => mocks.signUrl(...args) }),
    },
  },
}));

import {
  clearAvatarPhotoCache,
  getReadyAvatarPhotoUrl,
  preloadAvatarPhoto,
  signedAvatarUrl,
} from './avatarPhoto';

const userId = 'fb247595-95dc-47ce-8ca2-62c262a0d4d7';
const path = `${userId}/d78bb54a-e4eb-43f6-a93c-c1ab0abf63f2.webp`;
const signedUrl = 'https://storage.example.test/avatar?token=private';

let decodedImages = 0;

beforeEach(() => {
  clearAvatarPhotoCache();
  mocks.readPath.mockReset().mockResolvedValue({ data: { storage_path: path }, error: null });
  mocks.signUrl.mockReset().mockResolvedValue({ data: { signedUrl }, error: null });
  decodedImages = 0;
  vi.stubGlobal('Image', class {
    src = '';
    decoding = '';
    naturalWidth = 320;
    async decode() { decodedImages += 1; }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('private avatar preloading', () => {
  it('shares the URL lookup and image decoding across concurrent consumers', async () => {
    const [first, second, url] = await Promise.all([
      preloadAvatarPhoto(userId),
      preloadAvatarPhoto(userId),
      signedAvatarUrl(userId),
    ]);

    expect(first).toBe(signedUrl);
    expect(second).toBe(signedUrl);
    expect(url).toBe(signedUrl);
    expect(getReadyAvatarPhotoUrl(userId)).toBe(signedUrl);
    expect(mocks.readPath).toHaveBeenCalledTimes(1);
    expect(mocks.signUrl).toHaveBeenCalledTimes(1);
    expect(decodedImages).toBe(1);
  });

  it('clears signed URLs and decoded photos at sign-out', async () => {
    await preloadAvatarPhoto(userId);
    clearAvatarPhotoCache();
    expect(getReadyAvatarPhotoUrl(userId)).toBeNull();

    await preloadAvatarPhoto(userId);
    expect(mocks.readPath).toHaveBeenCalledTimes(2);
    expect(mocks.signUrl).toHaveBeenCalledTimes(2);
    expect(decodedImages).toBe(2);
  });

  it('uses initials when no photo is registered, without signing a nonexistent path', async () => {
    mocks.readPath.mockResolvedValueOnce({ data: null, error: null });
    expect(await preloadAvatarPhoto(userId)).toBeNull();
    expect(getReadyAvatarPhotoUrl(userId)).toBeNull();
    expect(mocks.signUrl).not.toHaveBeenCalled();
    expect(decodedImages).toBe(0);
  });

  it('rejects paths outside the requested user directory', async () => {
    mocks.readPath.mockResolvedValueOnce({
      data: { storage_path: 'other-user/avatar.webp' },
      error: null,
    });
    expect(await preloadAvatarPhoto(userId)).toBeNull();
    expect(mocks.signUrl).not.toHaveBeenCalled();
  });
});
