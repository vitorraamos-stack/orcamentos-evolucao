import { supabase } from "@/lib/supabase";
import type { FinanceInstallmentStatus } from "./types";

export type ConsultantFinancePendingGroup =
  | "second_installment"
  | "registration"
  | "rejected";

export type ConsultantFinancePendingRow = {
  id: string;
  os_id: string | null;
  status: FinanceInstallmentStatus;
  installment_no: number;
  total_installments: number;
  due_date: string | null;
};

export type ConsultantFinancePendingSummary = {
  secondInstallments: number;
  registrationPending: number;
  rejected: number;
  totalOrders: number;
};

export const CONSULTANT_PENDING_STATUSES = [
  "AWAITING_PROOF",
  "CADASTRO_PENDENTE",
  "REJEITADO",
] as const;

export function summarizeConsultantFinancePending(
  rows: ConsultantFinancePendingRow[]
): ConsultantFinancePendingSummary {
  const actionable = rows.filter(
    row =>
      CONSULTANT_PENDING_STATUSES.includes(
        row.status as (typeof CONSULTANT_PENDING_STATUSES)[number]
      ) &&
      (row.status !== "AWAITING_PROOF" ||
        (row.installment_no === 2 && row.total_installments === 2))
  );
  return {
    secondInstallments: actionable.filter(
      row =>
        row.status === "AWAITING_PROOF" &&
        row.installment_no === 2 &&
        row.total_installments === 2
    ).length,
    registrationPending: actionable.filter(
      row => row.status === "CADASTRO_PENDENTE"
    ).length,
    rejected: actionable.filter(row => row.status === "REJEITADO").length,
    totalOrders: new Set(actionable.map(row => row.os_id).filter(Boolean)).size,
  };
}

export async function listConsultantFinancePendingRows() {
  const rows: ConsultantFinancePendingRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("os_finance_installments")
      .select("id,os_id,status,installment_no,total_installments,due_date")
      .in("status", [...CONSULTANT_PENDING_STATUSES])
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ConsultantFinancePendingRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function getConsultantFinancePendingSummary() {
  return summarizeConsultantFinancePending(
    await listConsultantFinancePendingRows()
  );
}
