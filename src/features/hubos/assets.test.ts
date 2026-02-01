import { describe, expect, it } from 'vitest';
import { normalizeFirstLetter, sanitizeFilename, sanitizeFolderName } from './assetUtils';

describe('hubos assets helpers', () => {
  it('sanitizes filenames removing invalid characters and trimming length', () => {
    const result = sanitizeFilename('  meu/arquivo:teste?.pdf  ');
    expect(result).toBe('meuarquivoteste.pdf');
  });

  it('sanitizes folder names and removes leading dots', () => {
    const result = sanitizeFolderName('.. pasta de cliente ');
    expect(result).toBe('pasta_de_cliente');
  });

  it('normalizes first letter to A-Z or #', () => {
    expect(normalizeFirstLetter('Árvore')).toBe('A');
    expect(normalizeFirstLetter('123')).toBe('#');
  });
});
