import type {
  QuoteCurrentPublicResult,
  QuoteFormProduct,
} from "@shared/quotes";
import type { TechnicalInputValue } from "@shared/calculation-engine/contracts";
import type { CreateOrderPrefill } from "@/features/hubos/createOrderDomain";

const decimalToCm = (
  value: TechnicalInputValue | undefined
): number | null => {
  if (!value || value.kind !== "decimal" || value.unit === null) return null;

  const parsed = Number(value.value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  if (value.unit === "mm") return Number((parsed / 10).toFixed(2));
  if (value.unit === "cm") return Number(parsed.toFixed(2));
  if (value.unit === "m") return Number((parsed * 100).toFixed(2));
  return null;
};

export function buildQuoteOrderPrefill(
  quote: QuoteCurrentPublicResult,
  product: QuoteFormProduct
): CreateOrderPrefill {
  const technicalInputs = quote.request.request.technicalInputs;
  const quantity = Number(quote.request.request.commercialQuantity);
  const widthCm = decimalToCm(technicalInputs.width);
  const heightCm = decimalToCm(technicalInputs.height);

  const notes = [
    `Origem: Orçamento #${quote.quoteNumber}`,
    `Snapshot v${quote.snapshotVersion}`,
    quote.request.installation.requested ? "Inclui instalação" : null,
    quote.request.munck.requested
      ? `Munck previsto: ${quote.request.munck.hours}h`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    saleNumber: "",
    clientName: quote.commercial.customerName,
    description: `Orçamento #${quote.quoteNumber} — ${quote.commercial.title}`,
    deliveryDate: "",
    deliveryDeadlinePreset: null,
    logisticType: quote.request.installation.requested
      ? "instalacao"
      : "retirada",
    address: "",
    selectedArtDirectionTag: null,
    isUrgent: false,
    items: [
      {
        name: product.name,
        description: quote.commercial.title,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        width_cm: widthCm,
        height_cm: heightCm,
        unit: "un",
        measurement_unit: "cm",
        notes,
        status: "PENDING",
        sort_order: 0,
      },
    ],
  };
}
