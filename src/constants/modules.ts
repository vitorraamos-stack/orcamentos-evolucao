export const APP_MODULES = [
  {
    key: 'hub_os',
    label: 'Hub OS',
    routePrefixes: ['/hub-os', '/os'],
  },
  {
    key: 'hub_os_financeiro',
    label: 'Financeiro',
    routePrefixes: ['/hub-os/financeiro', '/financeiro'],
  },
  {
    key: 'hub_os_insumos',
    label: 'Hub OS - Aguardando Insumos',
    routePrefixes: [],
  },
  {
    key: 'hub_os_producao_externa',
    label: 'Hub OS - Produção Externa',
    routePrefixes: [],
  },
  {
    key: 'hub_os_kiosk',
    label: 'Quiosque (Acabamento)',
    routePrefixes: ['/os/kiosk'],
  },
  {
    key: 'galeria',
    label: 'Galeria',
    routePrefixes: ['/galeria'],
  },
  {
    key: 'calculadora',
    label: 'Calculadora',
    routePrefixes: ['/'],
  },
  {
    key: 'materiais',
    label: 'Materiais',
    routePrefixes: ['/materiais'],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    routePrefixes: ['/configuracoes'],
  },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]['key'];

export const APP_MODULE_KEYS = APP_MODULES.map((module) => module.key);

export const CONFIG_MODULE_KEY: AppModuleKey = 'configuracoes';
