import { describe, expect, it } from 'vitest';
import {
  APP_MODULE_KEYS,
  APP_MODULES,
  CONFIG_MODULE_KEY,
  KIOSK_MODULE_KEY,
} from './app-modules';

describe('app-modules catalog', () => {
  it('não possui chaves duplicadas', () => {
    const unique = new Set(APP_MODULES.map((module) => module.key));
    expect(unique.size).toBe(APP_MODULES.length);
  });

  it('APP_MODULE_KEYS não possui chaves duplicadas', () => {
    const unique = new Set(APP_MODULE_KEYS);
    expect(unique.size).toBe(APP_MODULE_KEYS.length);
  });

  it('não possui route prefixes duplicados em módulos diferentes', () => {
    const routeToModule = new Map<string, string>();

    for (const module of APP_MODULES) {
      for (const prefix of module.routePrefixes) {
        const existing = routeToModule.get(prefix);
        expect(existing).toBeUndefined();
        routeToModule.set(prefix, module.key);
      }
    }
  });

  it('APP_MODULE_KEYS reflete exatamente APP_MODULES', () => {
    const expected = APP_MODULES.map((module) => module.key);
    expect(APP_MODULE_KEYS).toEqual(expected);
  });

  it('constantes de módulos obrigatórios existem no catálogo', () => {
    expect(APP_MODULE_KEYS).toContain(CONFIG_MODULE_KEY);
    expect(APP_MODULE_KEYS).toContain(KIOSK_MODULE_KEY);
  });
});
