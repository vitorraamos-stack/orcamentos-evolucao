import type { PaymentMethod, PaymentStatus } from './types';

const DEFAULT_FOLDER_BASE = "\\\\servidor-pc\\...\\A_Z";

export const normalizeCustomerName = (name: string) => {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getCustomerLetter = (name: string) => {
  const normalized = normalizeCustomerName(name);
  const letter = normalized.charAt(0).toUpperCase();
  return letter >= 'A' && letter <= 'Z' ? letter : '#';
};

export const generateFolderPath = (customerName: string, osNumber: number | null) => {
  const basePath = import.meta.env.VITE_OS_FOLDER_BASE || DEFAULT_FOLDER_BASE;
  const cleanName = normalizeCustomerName(customerName) || 'SEM-NOME';
  const letter = getCustomerLetter(cleanName);
  const numberText = osNumber ? String(osNumber) : 'SEM-OS';
  return `${basePath}\\${letter}\\${cleanName}\\${numberText}`;
};

const isSameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const resolvePaymentStatus = (params: {
  method: PaymentMethod;
  amount: number;
  receivedDate: string;
  quoteTotal?: number | null;
}): PaymentStatus => {
  const { method, amount, receivedDate, quoteTotal } = params;

  if (method === 'AGENDADO') return 'SCHEDULED';

  const parsedDate = new Date(receivedDate);
  const today = new Date();

  if (
    quoteTotal &&
    quoteTotal > 0 &&
    amount >= quoteTotal &&
    isSameDate(parsedDate, today)
  ) {
    return 'RELEASED';
  }

  return 'UNDER_REVIEW';
};
