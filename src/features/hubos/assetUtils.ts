export const ASSET_BUCKET = 'os-artes';
export const MAX_ASSET_FILE_SIZE_BYTES = 500 * 1024 * 1024;

export const sanitizeFilename = (filename: string) => {
  const normalized = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim()
    .slice(0, 120);

  return normalized.length > 0 ? normalized : 'arquivo';
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
  return /^[A-Z]$/.test(firstLetter) ? firstLetter : '#';
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
