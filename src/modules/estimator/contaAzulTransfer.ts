import type {
  OfficialEstimatePublicResult,
  EstimatorFormProduct,
} from "@shared/estimator";
import {
  addDecimal, compareDecimal, decimalString, roundDecimal, subtractDecimal,
  type DecimalString,
} from "@shared/calculation-engine/decimal";

export type ContaAzulTransferLine = {
  id: "product" | "installation" | "munck" | "adjustment";
  description: string;
  quantity: string;
  // These are total amounts per item, NOT prices per unit.
  lineTotal: DecimalString;
};

export type ContaAzulTransfer = {
  lines: ContaAzulTransferLine[];
  installments: number;
  subtotal: DecimalString;
  finalTotal: DecimalString;
  copyText: string;
};

const ZERO = decimalString("0");
const money = (amount: DecimalString) => roundDecimal(amount, 2);
const formatBrl = (amount: DecimalString) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(amount));

/**
 * Assisted, manual-only transfer. Never guesses unit prices or calculates
 * an official quote. It reconciles the public result to the cent using a
 * transparent adjustment instead of silently changing a component price.
 */
export function buildContaAzulTransfer(
  result: OfficialEstimatePublicResult,
  product: EstimatorFormProduct,
  technicalLines: readonly string[]
): ContaAzulTransfer {
  if (result.productId !== product.productId ||
      result.productVersionId !== product.productVersionId ||
      result.productVersionNumber !== product.productVersionNumber)
    throw new Error("A versão calculada não corresponde ao produto selecionado.");

  const installation = result.installation.requested
    ? result.installation.price.amount : ZERO;
  const munck = result.munck.requested ? result.munck.price.amount : ZERO;
  const officialSubtotal = addDecimal(
    addDecimal(result.productSellingPrice.amount, installation), munck
  );
  if (compareDecimal(officialSubtotal, result.subtotalBeforeFinancialRate.amount) !== 0)
    throw new Error("Os totais de componentes não conferem com o cálculo oficial.");
  if (compareDecimal(result.totalSellingPrice.amount, ZERO) < 0)
    throw new Error("O total oficial não pode ser negativo.");

  const lines: ContaAzulTransferLine[] = [{
    id: "product",
    description: [product.name, ...technicalLines].filter(Boolean).join(" — "),
    quantity: result.commercialQuantity,
    lineTotal: money(result.productSellingPrice.amount),
  }];
  if (result.installation.requested)
    lines.push({
      id: "installation", description: "Instalação do produto",
      quantity: "1", lineTotal: money(installation),
    });
  if (result.munck.requested)
    lines.push({
      id: "munck",
      description: "Caminhão munck" + (
        result.munck.billedHours ? " — " + result.munck.billedHours + "h faturadas" : ""
      ),
      quantity: "1", lineTotal: money(munck),
    });

  const roundedSubtotal = lines.reduce(
    (sum, line) => addDecimal(sum, line.lineTotal), ZERO
  );
  const total = money(result.totalSellingPrice.amount);
  const adjustment = subtractDecimal(total, roundedSubtotal);
  if (compareDecimal(adjustment, ZERO) !== 0) {
    lines.push({
      id: "adjustment",
      description: "Ajuste da condição de pagamento e arredondamento",
      quantity: "1", lineTotal: adjustment,
    });
  }
  const recomposed = lines.reduce(
    (sum, line) => addDecimal(sum, line.lineTotal), ZERO
  );
  if (compareDecimal(recomposed, total) !== 0)
    throw new Error("Não foi possível conciliar o total para transferência manual.");

  const text = [
    "CONTA AZUL — CONFERÊNCIA E CADASTRO MANUAL",
    "Este texto não cria um orçamento nem autoriza envio ao cliente.",
    "",
    ...lines.flatMap((line, index) => [
      `${index + 1}. ${line.description}`,
      `Quantidade: ${line.quantity}`,
      `Valor TOTAL da linha (não unitário): ${formatBrl(line.lineTotal)}`,
      "",
    ]),
    `Subtotal oficial antes da condição de pagamento: ${formatBrl(money(result.subtotalBeforeFinancialRate.amount))}`,
    `Condição de pagamento: ${result.installments}x`,
    `TOTAL OFICIAL CALCULADO: ${formatBrl(total)}`,
    "",
    "CONFIRA no Conta Azul a quantidade, os valores unitários que informar,",
    "os adicionais, a condição de pagamento e o total final antes de salvar",
    "ou enviar a proposta. Não some novamente o subtotal ou o total às linhas.",
  ].join("\n");
  return {
    lines, installments: result.installments,
    subtotal: money(result.subtotalBeforeFinancialRate.amount),
    finalTotal: total, copyText: text,
  };
}
