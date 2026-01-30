export type LogisticType = 'retirada' | 'entrega' | 'instalacao';

export type ArtStatus =
  | 'Caixa de Entrada'
  | 'Em Criação'
  | 'Para Aprovação'
  | 'Ajustes'
  | 'Produzir';

export type ProdStatus =
  | 'Produção'
  | 'Em Acabamento'
  | 'Pronto / Avisar Cliente'
  | 'Logística (Entrega/Transportadora)'
  | 'Instalação Agendada'
  | 'Finalizados';

export type OsOrder = {
  id: string;
  sale_number: string;
  client_name: string;
  title: string | null;
  description: string | null;
  delivery_date: string | null;
  logistic_type: LogisticType;
  address: string | null;
  art_status: ArtStatus;
  prod_status: ProdStatus | null;
  reproducao: boolean;
  letra_caixa: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HubOsFilters = {
  search: string;
  reproducao: boolean;
  letraCaixa: boolean;
  logisticType: 'all' | LogisticType;
  overdueOnly: boolean;
};
