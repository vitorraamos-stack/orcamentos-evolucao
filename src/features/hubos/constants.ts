import type { ArtStatus, ProdStatus } from './types';

export const ART_COLUMNS: ArtStatus[] = [
  'Caixa de Entrada',
  'Em Criação',
  'Para Aprovação',
  'Ajustes',
  'Produzir',
];

export const PROD_COLUMNS: ProdStatus[] = [
  'Produção',
  'Em Acabamento',
  'Pronto / Avisar Cliente',
  'Logística (Entrega/Transportadora)',
  'Instalação Agendada',
  'Finalizados',
];

export const LOGISTIC_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'instalacao', label: 'Instalação' },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  'Caixa de Entrada': 'Caixa de Entrada',
  'Em Criação': 'Em Criação',
  'Para Aprovação': 'Para Aprovação',
  Ajustes: 'Ajustes',
  Produzir: 'Produzir',
  Produção: 'Produção',
  'Em Acabamento': 'Em Acabamento',
  'Pronto / Avisar Cliente': 'Pronto / Avisar Cliente',
  'Logística (Entrega/Transportadora)': 'Logística (Entrega/Transportadora)',
  'Instalação Agendada': 'Instalação Agendada',
  Finalizados: 'Finalizados',
};
