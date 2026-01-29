export type LogisticType = "retirada" | "entrega" | "instalacao"

export type OsOrder = {
  id: string
  sale_number: string
  client_name: string
  title?: string | null
  description: string | null
  delivery_date: string | null
  logistic_type: LogisticType
  address: string | null
  art_status: string
  prod_status: string | null
  reproducao: boolean
  letra_caixa: boolean
  created_at: string
  updated_at?: string | null
}
