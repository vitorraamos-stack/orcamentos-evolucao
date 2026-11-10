export const APP_MODULES = [
  {
    key: 'hub_os',
    label: 'Ordens de Serviço',
    routePrefixes: ['/os'],
  },
  {
    key: 'hub_os_dashboard',
    label: 'Dashboard Operacional',
    routePrefixes: ['/hub-os'],
  },
  {
    key: 'hub_os_arte',
    label: 'Quadro de Arte',
    routePrefixes: ['/os/arte'],
  },
  {
    key: 'hub_os_producao',
    label: 'Quadro de Produção',
    routePrefixes: ['/os/producao'],
  },
  {
    key: 'hub_os_instalacoes',
    label: 'Instalações',
    routePrefixes: ['/instalacoes'],
  },
  {
    key: 'hub_os_entregas',
    label: 'Entregas',
    routePrefixes: ['/entregas'],
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
    key: 'impressao_estoque',
    label: 'Impressão & Estoque',
    routePrefixes: ['/impressao-estoque'],
  },
  {
    key: 'orcamentista',
    label: 'Orçamentista',
    routePrefixes: ['/orcamentista'],
  },
  {
    key: 'biblioteca_gestao',
    label: 'Gestão da Biblioteca',
    routePrefixes: ['/biblioteca/gestao'],
  },
  {
    key: 'precos_custos',
    label: 'Preços e Custos',
    routePrefixes: ['/configuracoes/precos'],
  },
  {
    key: 'regras_operacionais',
    label: 'Regras Operacionais',
    routePrefixes: ['/configuracoes/regras-operacionais'],
  },
  {
    key: 'biblioteca_produtos',
    label: 'Biblioteca de Produtos',
    routePrefixes: ['/biblioteca'],
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
    label: 'Usuários',
    routePrefixes: ['/configuracoes'],
  },
] as const;

export type AppModuleDefinition = (typeof APP_MODULES)[number];
export type AppModuleKey = AppModuleDefinition['key'];

export const APP_MODULE_KEYS = APP_MODULES.map((module) => module.key) as AppModuleKey[];

export const CONFIG_MODULE_KEY: AppModuleKey = 'configuracoes';
export const KIOSK_MODULE_KEY: AppModuleKey = 'hub_os_kiosk';
