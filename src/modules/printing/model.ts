export interface PrintRoll {
  id: string;
  code: string;
  material: string;
  width_cm: number;
  initial_length_m: number;
  remaining_length_m: number;
  created_at: string;
  archived_at?: string | null;
  archived_reason?: string | null;
}
export interface InkBalance { color: "C" | "M" | "Y" | "K"; balance_ml: number; }
export interface StockEvent {
  id: string;
  kind: "ROLL_IN" | "PRINT" | "REPRINT" | "ROLL_ADJUST" | "ROLL_ARCHIVE" | "INK_IN" | "INK_USE";
  roll_id: string | null;
  color: string | null;
  delta_m: number | null;
  delta_ml: number | null;
  os_ref: string | null;
  reason: string | null;
  created_at: string;
}
export const decimal = (v: string) => Number(v.trim().replace(",", "."));
export function estimatePrint(
  roll: Pick<PrintRoll,"width_cm"|"remaining_length_m"> | undefined,
  widthCm: number,lengthCm: number,copies: number,wasteCm = 0
): number {
  if (!roll) throw new Error("Selecione uma bobina.");
  if (![widthCm,lengthCm,copies,wasteCm].every(Number.isFinite) ||
      widthCm<=0 || lengthCm<=0 || !Number.isInteger(copies) || copies<1 || wasteCm<0)
    throw new Error("Informe dimensões e quantidades válidas.");
  if (widthCm>roll.width_cm) throw new Error("A arte excede a largura da bobina.");
  const meters = Math.round((lengthCm*copies+wasteCm)*100)/10000;
  if (meters<=0 || meters>roll.remaining_length_m+0.000001)
    throw new Error("Bobina sem metragem suficiente.");
  return meters;
}
