// src/lib/number.ts
export function parsePtBrNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;

  let s = String(input).trim();
  if (!s) return 0;

  // remove espaços e símbolos comuns
  s = s.replace(/\s+/g, "").replace(/R\$/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  // Caso tenha vírgula e ponto: o último separador geralmente é o decimal
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // 1.234,56  -> 1234.56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,234.56  -> 1234.56
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Só vírgula: decimal
    // 123,45 -> 123.45
    // e se tiver ponto, tratar como milhar por segurança: 1.234,5 -> 1234.5
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    // Só ponto: pode ser decimal OU milhar.
    // Heurística: se tiver exatamente 3 dígitos após o último ponto, tratar como milhar.
    const tail = s.slice(lastDot + 1);
    if (/^\d{3}$/.test(tail)) {
      // 1.200 -> 1200
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
