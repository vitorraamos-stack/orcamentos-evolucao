import { supabase } from '@/lib/supabase';

export type OrderSource = 'os' | 'os_orders';

const NOT_FOUND_CODE = 'PGRST116';

const normalizeDigits = (value: string | null | undefined) =>
  String(value ?? '').replace(/\D+/g, '');

const hasStandaloneNumber = (value: string | null | undefined, code: string) => {
  const source = String(value ?? '');
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|\\D)${escapedCode}(\\D|$)`);
  return pattern.test(source);
};

const lookupCanonicalOrderId = async (code: string): Promise<string | null> => {
  const { data: bySaleNumber, error: bySaleNumberError } = await supabase
    .from('os_orders')
    .select('id')
    .eq('sale_number', code)
    .limit(1)
    .maybeSingle();

  if (bySaleNumberError && bySaleNumberError.code !== NOT_FOUND_CODE) throw bySaleNumberError;
  if (bySaleNumber) return bySaleNumber.id;

  const { data: fuzzyRows, error: fuzzyError } = await supabase
    .from('os_orders')
    .select('id, sale_number, title')
    .or(`sale_number.ilike.%${code}%,title.ilike.%${code}%`)
    .limit(50);

  if (fuzzyError) throw fuzzyError;

  const match = (fuzzyRows || []).find(
    (row) => normalizeDigits(row.sale_number) === code || hasStandaloneNumber(row.title, code)
  );

  return match?.id ?? null;
};

const lookupLegacyOrderId = async (code: string): Promise<string | null> => {
  const numericCode = Number(code);
  const hasNumericCode = Number.isInteger(numericCode) && numericCode > 0;

  if (hasNumericCode) {
    const { data: byOsNumber, error: byOsNumberError } = await supabase
      .from('os')
      .select('id')
      .eq('os_number', numericCode)
      .limit(1)
      .maybeSingle();

    if (byOsNumberError && byOsNumberError.code !== NOT_FOUND_CODE) throw byOsNumberError;
    if (byOsNumber) return byOsNumber.id;
  }

  const { data: bySaleNumber, error: bySaleNumberError } = await supabase
    .from('os')
    .select('id')
    .eq('sale_number', code)
    .limit(1)
    .maybeSingle();

  if (bySaleNumberError && bySaleNumberError.code !== NOT_FOUND_CODE) throw bySaleNumberError;
  if (bySaleNumber) return bySaleNumber.id;

  const { data: fuzzySaleRows, error: fuzzySaleError } = await supabase
    .from('os')
    .select('id, sale_number')
    .ilike('sale_number', `%${code}%`)
    .limit(50);

  if (fuzzySaleError) throw fuzzySaleError;

  const byNormalizedSale = (fuzzySaleRows || []).find((row) => normalizeDigits(row.sale_number) === code);
  if (byNormalizedSale) return byNormalizedSale.id;

  const { data: fuzzyTitleRows, error: fuzzyTitleError } = await supabase
    .from('os')
    .select('id, title')
    .ilike('title', `%${code}%`)
    .limit(50);

  if (fuzzyTitleError) throw fuzzyTitleError;

  const byTitle = (fuzzyTitleRows || []).find((row) => hasStandaloneNumber(row.title, code));
  return byTitle?.id ?? null;
};

export const lookupOrderForKiosk = async (code: string): Promise<{ id: string; source: OrderSource } | null> => {
  const numericCode = Number(code);
  const hasNumericCode = Number.isInteger(numericCode) && numericCode > 0;

  if (!hasNumericCode) {
    return null;
  }

  const canonicalId = await lookupCanonicalOrderId(code);
  if (canonicalId) {
    return { id: canonicalId, source: 'os_orders' };
  }

  const legacyId = await lookupLegacyOrderId(code);
  if (legacyId) {
    return { id: legacyId, source: 'os' };
  }

  return null;
};
