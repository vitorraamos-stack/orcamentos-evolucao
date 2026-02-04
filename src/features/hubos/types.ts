export type LogisticType = 'retirada' | 'entrega' | 'instalacao';

export type ProductionTag = 'EM_PRODUCAO' | 'PRONTO';

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
  production_tag: ProductionTag | null;
  art_status: ArtStatus;
  prod_status: ProdStatus | null;
  reproducao: boolean;
  letra_caixa: boolean;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OsOrderEvent = {
  id: string;
  os_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  os?: {
    id: string;
    sale_number: string;
    client_name: string;
    title: string | null;
  } | null;
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export type HubOsFilters = {
  search: string;
  reproducao: boolean;
  letraCaixa: boolean;
  logisticType: 'all' | LogisticType;
  overdueOnly: boolean;
};

export type AssetJobStatus =
  | 'UPLOADING'
  | 'PENDING'
  | 'PROCESSING'
  | 'DONE'
  | 'DONE_CLEANUP_FAILED'
  | 'CLEANED'
  | 'ERROR';

export type AssetJob = {
  id: string;
  os_id: string;
  status: AssetJobStatus;
  created_at: string;
  updated_at: string;
  last_error: string | null;
};
