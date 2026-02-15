export type LogisticType = 'retirada' | 'entrega' | 'instalacao';

export type ProductionTag =
  | 'EM_PRODUCAO'
  | 'PRONTO'
  | 'AGUARDANDO_INSUMOS'
  | 'PRODUCAO_EXTERNA';

export type ArtDirectionTag = 'ARTE_PRONTA_EDICAO' | 'CRIACAO_ARTE' | 'URGENTE';

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
  os_number?: number | null;
  sale_number: string;
  client_name: string;
  title: string | null;
  description: string | null;
  delivery_date: string | null;
  logistic_type: LogisticType;
  address: string | null;
  address_lat?: number | null;
  address_lng?: number | null;
  address_geocoded_at?: string | null;
  address_geocode_provider?: string | null;
  production_tag: ProductionTag | null;
  insumos_details: string | null;
  insumos_return_notes: string | null;
  insumos_requested_at: string | null;
  insumos_resolved_at: string | null;
  insumos_resolved_by: string | null;
  art_direction_tag: ArtDirectionTag | null;
  art_status: ArtStatus;
  prod_status: ProdStatus | null;
  reproducao: boolean;
  letra_caixa: boolean;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  folder_path?: string | null;
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


export type FinanceInstallmentStatus =
  | 'AWAITING_PROOF'
  | 'PENDING_REVIEW'
  | 'CONCILIADO'
  | 'LANCADO'
  | 'REJEITADO'
  | 'CADASTRO_PENDENTE';

export type FinanceInstallment = {
  id: string;
  os_id: string;
  installment_no: 1 | 2;
  total_installments: 1 | 2;
  due_date: string | null;
  asset_id: string | null;
  status: FinanceInstallmentStatus;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  os_orders?: Pick<OsOrder, 'id' | 'sale_number' | 'client_name' | 'created_at'> | null;
  os_order_assets?: {
    id: string;
    object_path: string;
    original_name: string | null;
  } | null;
};
