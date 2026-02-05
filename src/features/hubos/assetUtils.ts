export const ASSET_BUCKET = 'os-artes';
export const MAX_ASSET_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const ALLOWED_R2_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/postscript',
  'application/vnd.adobe.illustrator',
  'application/vnd.corel-draw',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export const sanitizeFilename = (filename: string) => {
  const normalized = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return normalized.length > 0 ? normalized : 'arquivo';
};

export const buildAssetObjectPath = (osId: string, jobId: string, filename: string, now = new Date()) => {
  const sanitizedName = sanitizeFilename(filename);
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `os_orders/${osId}/${jobId}/${timestamp}_${sanitizedName}`;
};

const extensionToContentType: Record<string, string> = {
  pdf: 'application/pdf',
  ai: 'application/postscript',
  eps: 'application/postscript',
  cdr: 'application/vnd.corel-draw',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const resolveAssetContentType = (file: File) => {
  const direct = file.type?.trim();
  if (direct && ALLOWED_R2_CONTENT_TYPES.has(direct)) {
    return direct;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && extensionToContentType[extension]) {
    return extensionToContentType[extension];
  }

  throw new Error('Tipo de arquivo não permitido para upload.');
};

export const sanitizeFolderName = (name: string) => {
  const normalized = sanitizeFilename(name);
  const cleaned = normalized.replace(/^[._\s]+/, '').slice(0, 120);
  return cleaned || 'pasta';
};

export const normalizeFirstLetter = (value: string) => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const firstLetter = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(firstLetter) ? firstLetter : '_';
};

export const validateFiles = (files: File[]) => {
  for (const file of files) {
    if (!file.name || file.name.trim().length === 0) {
      return { ok: false, error: 'Nome do arquivo inválido.' };
    }
    if (file.size > MAX_ASSET_FILE_SIZE_BYTES) {
      return { ok: false, error: 'Arquivo acima de 500MB.' };
    }
  }
  return { ok: true };
};
