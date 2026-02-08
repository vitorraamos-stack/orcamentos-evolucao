export type OsStatus = {
  id: string;
  name: string;
  position: number;
  is_terminal: boolean;
  created_at: string;
};

export type PaymentStatus = 'PENDING' | 'UNDER_REVIEW' | 'RELEASED' | 'BLOCKED' | 'SCHEDULED';

export type Os = {
  id: string;
  os_number: number | null;
  quote_id: string | null;
  quote_total: number | null;
  sale_number: string | null;
  client_name: string;
  customer_name: string;
  customer_phone: string | null;
  title: string;
  description: string | null;
  delivery_date: string | null;
  delivery_type: DeliveryType | null;
  shipping_carrier: string | null;
  tracking_code: string | null;
  address: string | null;
  notes: string | null;
  installation_date: string | null;
  installation_time_window: string | null;
  on_site_contact: string | null;
  status_arte: string | null;
  status_producao: string | null;
  is_reproducao: boolean | null;
  repro_motivo: string | null;
  has_letra_caixa: boolean | null;
  folder_path: string | null;
  status_id: string;
  payment_status: PaymentStatus;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryType = 'RETIRADA' | 'ENTREGA' | 'INSTALACAO';

export type PaymentMethod = 'PIX' | 'CARTAO' | 'AGENDADO' | 'OUTRO';

export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type OsPaymentProof = {
  id: string;
  os_id: string;
  method: PaymentMethod;
  amount: number;
  received_date: string;
  installments: string | null;
  cadastro_completo: boolean;
  attachment_path: string | null;
  attachment_url: string | null;
  storage_provider?: string | null;
  storage_bucket?: string | null;
  r2_etag?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  status: PaymentProofStatus;
  created_by: string | null;
  created_at: string;
};

export type OsEvent = {
  id: string;
  os_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};
