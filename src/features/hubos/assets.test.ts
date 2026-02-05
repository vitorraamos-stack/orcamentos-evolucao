import { describe, expect, it } from 'vitest';
import {
  buildAssetObjectPath,
  normalizeFirstLetter,
  sanitizeFilename,
  sanitizeFolderName,
  validateFiles,
} from './assetUtils';

describe('hubos assets helpers', () => {
  it('sanitizes filenames removing invalid characters and trimming length', () => {
    const result = sanitizeFilename('  meu/arquivo:teste?.pdf  ');
    expect(result).toBe('meuarquivoteste.pdf');
  });

  it('sanitizes folder names and removes leading dots', () => {
    const result = sanitizeFolderName('.. pasta de cliente ');
    expect(result).toBe('pasta de cliente');
  });

  it('normalizes first letter to A-Z or _', () => {
    expect(normalizeFirstLetter('Árvore')).toBe('A');
    expect(normalizeFirstLetter('123')).toBe('_');
  });

  it('rejects files larger than 500MB', () => {
    const largeFile = { name: 'big.pdf', size: 500 * 1024 * 1024 + 1 } as File;
    const result = validateFiles([largeFile]);
    expect(result.ok).toBe(false);
  });

  it('builds asset object path with expected prefix', () => {
    const fixedDate = new Date('2024-01-01T00:00:00.000Z');
    const path = buildAssetObjectPath('os-123', 'job-456', 'arte.pdf', fixedDate);
    expect(path.startsWith('os_orders/os-123/job-456/')).toBe(true);
  });
});
