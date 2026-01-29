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
  customer_name: string;
  customer_phone: string | null;
  title: string;
  description: string | null;
  folder_path: string | null;
  status_id: string;
  payment_status: PaymentStatus;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

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
