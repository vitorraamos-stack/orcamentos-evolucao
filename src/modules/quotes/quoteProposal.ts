import type {
  QuoteCurrentPublicResult,
  QuoteFormProduct,
  QuoteStatus,
} from "@shared/quotes";
import type { ProductInput } from "@shared/product-engineering/inputs";
import type { TechnicalInputValue } from "@shared/calculation-engine/contracts";

export const QUOTE_PROPOSAL_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviado",
  ACCEPTED: "Aceito",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
};

export type QuoteProposalSpec = {
  label: string;
  value: string;
};

export type QuoteProposalData = {
  quoteId: string;
  quoteNumber: number;
  status: QuoteStatus;
  statusLabel: string;
  snapshotVersion: number;
  savedAt: string;
  customerName: string;
  customerPhone: string | null;
  title: string;
  productName: string;
  productVersionNumber: number;
  quantity: string;
  specs: QuoteProposalSpec[];
  installments: number;
  productPrice: string;
  installation: {
    requested: boolean;
    areaM2: string | null;
    price: string;
  };
  munck: {
    requested: boolean;
    billedHours: string | null;
    price: string;
  };
  subtotal: string;
  total: string;
};

const localizedDecimal = (value: string) => {
  const normalized = value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
  return normalized.replace(".", ",");
};

const formatTechnicalValue = (
  input: ProductInput,
  value: TechnicalInputValue
): string => {
  if (value.kind === "decimal") {
    const numeric = localizedDecimal(value.value);
    return value.unit ? `${numeric} ${value.unit}` : numeric;
  }

  if (value.kind === "boolean") return value.value ? "Sim" : "Não";

  if (input.type === "SELECT") {
    return (
      input.options.find(option => option.value === value.value)?.label ??
      value.value
    );
  }

  return value.value;
};

export function buildQuoteProposalData(
  quote: QuoteCurrentPublicResult,
  product: QuoteFormProduct
): QuoteProposalData {
  const technicalInputs = quote.request.request.technicalInputs;
  const specs = product.inputs.flatMap(input => {
    const value = technicalInputs[input.key];
    if (!value) return [];
    return [
      {
        label: input.label,
        value: formatTechnicalValue(input, value),
      },
    ];
  });

  return {
    quoteId: quote.quoteId,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    statusLabel: QUOTE_PROPOSAL_STATUS_LABEL[quote.status],
    snapshotVersion: quote.snapshotVersion,
    savedAt: quote.savedAt,
    customerName: quote.commercial.customerName,
    customerPhone: quote.commercial.customerPhone,
    title: quote.commercial.title,
    productName: product.name,
    productVersionNumber: product.productVersionNumber,
    quantity: localizedDecimal(quote.request.request.commercialQuantity),
    specs,
    installments: quote.publicResult.installments,
    productPrice: quote.publicResult.productSellingPrice.amount,
    installation: {
      requested: quote.publicResult.installation.requested,
      areaM2: quote.publicResult.installation.areaM2
        ? localizedDecimal(quote.publicResult.installation.areaM2)
        : null,
      price: quote.publicResult.installation.price.amount,
    },
    munck: {
      requested: quote.publicResult.munck.requested,
      billedHours: quote.publicResult.munck.billedHours
        ? localizedDecimal(quote.publicResult.munck.billedHours)
        : null,
      price: quote.publicResult.munck.price.amount,
    },
    subtotal: quote.publicResult.subtotalBeforeFinancialRate.amount,
    total: quote.negotiation.totalSellingPrice.amount,
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const brl = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date(value));

export function buildQuoteProposalPrintHtml(
  data: QuoteProposalData,
  logoUrl: string
): string {
  const specRows = data.specs.length
    ? data.specs
        .map(
          spec =>
            `<div class="spec"><span>${escapeHtml(spec.label)}</span><strong>${escapeHtml(spec.value)}</strong></div>`
        )
        .join("")
    : '<p class="muted">Sem especificações adicionais.</p>';

  const installationRow = data.installation.requested
    ? `<div class="row"><span>Instalação${data.installation.areaM2 ? ` · ${escapeHtml(data.installation.areaM2)} m²` : ""}</span><strong>${escapeHtml(brl(data.installation.price))}</strong></div>`
    : "";

  const munckRow = data.munck.requested
    ? `<div class="row"><span>Caminhão munck${data.munck.billedHours ? ` · ${escapeHtml(data.munck.billedHours)}h faturadas` : ""}</span><strong>${escapeHtml(brl(data.munck.price))}</strong></div>`
    : "";

  const phone = data.customerPhone
    ? `<div><span class="eyebrow">Telefone</span><strong>${escapeHtml(data.customerPhone)}</strong></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Proposta Comercial #${data.quoteNumber}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
  body { width: 210mm; min-height: 297mm; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 10mm; border-bottom: 2px solid #111827; }
  .logo { width: 58mm; max-height: 24mm; object-fit: contain; object-position: left center; }
  .meta { text-align: right; }
  .meta h1 { margin: 0 0 5px; font-size: 24px; }
  .meta p { margin: 3px 0; font-size: 12px; color: #4b5563; }
  .badge { display: inline-block; margin-top: 5px; padding: 5px 9px; border: 1px solid #d1d5db; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .section { padding: 8mm 0; border-bottom: 1px solid #e5e7eb; }
  .section h2 { margin: 0 0 5mm; font-size: 15px; text-transform: uppercase; letter-spacing: .08em; }
  .client { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
  .client .wide { grid-column: 1 / -1; }
  .eyebrow { display: block; margin-bottom: 4px; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
  .client strong { display: block; font-size: 14px; line-height: 1.4; }
  .product-title { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #6b7280; font-size: 12px; }
  .specs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 6mm; }
  .spec { padding: 10px 12px; display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e5e7eb; }
  .spec:nth-child(odd) { border-right: 1px solid #e5e7eb; }
  .spec span { color: #6b7280; font-size: 11px; }
  .spec strong { font-size: 11px; text-align: right; }
  .financial { margin-top: 3mm; }
  .row { display: flex; justify-content: space-between; gap: 20px; padding: 9px 0; border-bottom: 1px solid #f0f1f3; font-size: 13px; }
  .row span { color: #4b5563; }
  .total { margin-top: 7mm; padding: 8mm; background: #f3f4f6; border-radius: 10px; text-align: right; }
  .total span { display: block; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .total strong { display: block; margin-top: 3px; font-size: 28px; }
  .footer { margin-top: auto; padding-top: 10mm; color: #6b7280; font-size: 10px; line-height: 1.5; }
</style>
</head>
<body>
<main class="page">
  <header class="header">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="Evolução Comunicação Visual" />
    <div class="meta">
      <h1>Proposta Comercial</h1>
      <p>Orçamento #${data.quoteNumber}</p>
      <p>${escapeHtml(date(data.savedAt))}</p>
    </div>
  </header>

  <section class="section">
    <h2>Cliente</h2>
    <div class="client">
      <div><span class="eyebrow">Cliente</span><strong>${escapeHtml(data.customerName)}</strong></div>
      ${phone}
      <div class="wide"><span class="eyebrow">Referência</span><strong>${escapeHtml(data.title)}</strong></div>
    </div>
  </section>

  <section class="section">
    <h2>Produto e especificações</h2>
    <h3 class="product-title">${escapeHtml(data.productName)}</h3>
    <p class="muted">Quantidade: ${escapeHtml(data.quantity)}</p>
    <div class="specs">${specRows}</div>
  </section>

  <section class="section">
    <h2>Investimento</h2>
    <div class="financial">
      <div class="row"><span>Produto</span><strong>${escapeHtml(brl(data.productPrice))}</strong></div>
      ${installationRow}
      ${munckRow}
      <div class="row"><span>Subtotal antes da condição financeira</span><strong>${escapeHtml(brl(data.subtotal))}</strong></div>
      <div class="row"><span>Condição de pagamento</span><strong>${data.installments}x</strong></div>
    </div>
    <div class="total">
      <span>Total da proposta</span>
      <strong>${escapeHtml(brl(data.total))}</strong>
    </div>
  </section>

  <footer class="footer">
    Proposta comercial referente ao orçamento #${data.quoteNumber}.
    Valores e condições correspondem à versão salva deste orçamento.
  </footer>
</main>
</body>
</html>`;
}
