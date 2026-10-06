import Decimal from "decimal.js";

const normalize = (value: string) => value.trim().replace(",", ".");

export const decimalInput = (value: string) => {
  const normalized = normalize(value);
  if (!normalized) throw new Error("Informe um valor.");
  const decimal = new Decimal(normalized);
  if (!decimal.isFinite()) throw new Error("Informe um valor válido.");
  return decimal;
};

export const markupToMultiplier = (markup: string) =>
  new Decimal(markup).plus(1).toString();

export const multiplierToMarkup = (multiplier: string) => {
  const value = decimalInput(multiplier);
  if (value.lt(1))
    throw new Error("O multiplicador deve ser igual ou maior que 1,00x.");
  return value.minus(1).toString();
};

export const rateToPercent = (rate: string) =>
  new Decimal(rate).times(100).toString();

export const percentToRate = (percent: string) => {
  const value = decimalInput(percent);
  if (value.lt(0)) throw new Error("A taxa não pode ser negativa.");
  return value.div(100).toString();
};

export const nonNegativeAmount = (amount: string) => {
  const value = decimalInput(amount);
  if (value.lt(0)) throw new Error("O valor não pode ser negativo.");
  return value.toString();
};
