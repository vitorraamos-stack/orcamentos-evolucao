import type { FinanceInstallment } from "@/features/hubos/types";
import type { ConsultantFinancePendingGroup } from "@/features/hubos/financePending";

export type FinancePendingItem = {
  key: string;
  group: ConsultantFinancePendingGroup;
  value: FinanceInstallment;
};

export type FinancePendingSortMode =
  | "priority"
  | "oldest"
  | "newest"
  | "due_date";

export type FinanceNoteHistoryEntry = {
  header: string;
  timestamp: string;
  actor: string;
  status: string;
  body: string;
};

export type ParsedFinanceNoteHistory = {
  entries: FinanceNoteHistoryEntry[];
  fallback: string | null;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDueDate = (value?: string | null) =>
  value ? new Date(value.includes("T") ? value : `${value}T12:00:00`) : null;

export const isOverdueInstallment = (
  item: FinancePendingItem,
  now = new Date()
) => {
  if (item.group !== "second_installment") return false;
  const dueDate = parseDueDate(item.value.due_date);
  return Boolean(dueDate && startOfDay(dueDate) < startOfDay(now));
};

export const isDueToday = (item: FinancePendingItem, now = new Date()) => {
  if (item.group !== "second_installment") return false;
  const dueDate = parseDueDate(item.value.due_date);
  return Boolean(
    dueDate && startOfDay(dueDate).getTime() === startOfDay(now).getTime()
  );
};

export const getPendingPriority = (
  item: FinancePendingItem,
  now = new Date()
) => {
  if (item.group === "rejected") return 1;
  if (isOverdueInstallment(item, now)) return 2;
  if (isDueToday(item, now)) return 3;
  if (item.group === "registration") return 4;
  if (item.group === "second_installment") return 5;
  return 6;
};

const timestamp = (value?: string | null) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

export const sortFinancePendingItems = (
  items: readonly FinancePendingItem[],
  mode: FinancePendingSortMode,
  now = new Date()
) =>
  [...items].sort((left, right) => {
    const leftCreated = timestamp(left.value.created_at);
    const rightCreated = timestamp(right.value.created_at);
    const leftDue = timestamp(parseDueDate(left.value.due_date)?.toISOString());
    const rightDue = timestamp(
      parseDueDate(right.value.due_date)?.toISOString()
    );

    let comparison = 0;
    if (mode === "priority") {
      comparison =
        getPendingPriority(left, now) - getPendingPriority(right, now);
    } else if (mode === "oldest") {
      comparison = (leftCreated ?? Infinity) - (rightCreated ?? Infinity);
    } else if (mode === "newest") {
      comparison = (rightCreated ?? -Infinity) - (leftCreated ?? -Infinity);
    } else {
      comparison = (leftDue ?? Infinity) - (rightDue ?? Infinity);
    }

    if (comparison !== 0) return comparison;
    if (leftCreated !== rightCreated) {
      return (leftCreated ?? Infinity) - (rightCreated ?? Infinity);
    }
    return left.key.localeCompare(right.key, "pt-BR");
  });

export const getFinancePendingActionText = (
  group: ConsultantFinancePendingGroup
) =>
  ({
    second_installment: "Enviar comprovante da 2ª parcela",
    registration: "Corrigir cadastro solicitado pelo Financeiro",
    rejected: "Corrigir pendência rejeitada pelo Financeiro",
  })[group];

export const formatDueDateStatus = (
  item: FinancePendingItem,
  now = new Date()
) => {
  if (item.group !== "second_installment") return null;
  const dueDate = parseDueDate(item.value.due_date);
  if (!dueDate) return null;
  const difference = Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / 86_400_000
  );
  if (difference === 0) return "Vence hoje";
  if (difference < 0)
    return `Vencido há ${Math.abs(difference)} ${
      Math.abs(difference) === 1 ? "dia" : "dias"
    }`;
  return `Vence em ${difference} ${difference === 1 ? "dia" : "dias"}`;
};

export const parseFinanceNoteHistory = (
  notes?: string | null
): ParsedFinanceNoteHistory => {
  const original = notes?.trim() ?? "";
  if (!original) return { entries: [], fallback: null };

  const blocks = original.split(/\n\s*\n/).filter(Boolean);
  const entries = blocks.map(block => {
    const [header = "", ...bodyLines] = block.split("\n");
    const match = header.match(/^\[([^\]]+)\]\s+([^•]+?)\s*•\s*(.+)$/);
    if (!match) return null;
    return {
      header,
      timestamp: match[1].trim(),
      actor: match[2].trim(),
      status: match[3].trim(),
      body: bodyLines.join("\n").trim(),
    };
  });

  if (entries.some(entry => entry === null)) {
    return { entries: [], fallback: original };
  }
  return {
    entries: entries as FinanceNoteHistoryEntry[],
    fallback: null,
  };
};

export const getLatestFinanceNote = (notes?: string | null) => {
  const parsed = parseFinanceNoteHistory(notes);
  if (parsed.fallback) return parsed.fallback;
  const financeEntry = [...parsed.entries]
    .reverse()
    .find(entry => entry.actor.toLocaleUpperCase("pt-BR") === "FINANCEIRO");
  return financeEntry?.body || notes?.trim() || null;
};
