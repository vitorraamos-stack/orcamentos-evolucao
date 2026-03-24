export type MaterialTierInput = {
  min_area: number;
  max_area: number | null;
  price_per_m2: number;
};

export type MaterialMutationInput = {
  material_id?: string;
  name: string;
  description?: string | null;
  equivalence_message?: string | null;
  tipo_calculo: 'm2' | 'linear';
  min_price: number | null;
  image_url?: string | null;
  tiers: MaterialTierInput[];
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const validateMaterialImage = (file: File) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato de imagem inválido. Use JPG, PNG ou WEBP.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Imagem muito grande. Limite de 2MB.');
  }
};

const ensureFiniteNumber = (value: number, fieldLabel: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldLabel} inválido.`);
  }
};

export const validateMaterialPayload = (payload: MaterialMutationInput) => {
  const name = payload.name.trim();
  if (!name) {
    throw new Error('Nome do material é obrigatório.');
  }

  if (!payload.tiers.length) {
    throw new Error('Informe pelo menos uma faixa de preço.');
  }

  if (payload.min_price !== null) {
    ensureFiniteNumber(payload.min_price, 'Preço mínimo');
    if (payload.min_price < 0) {
      throw new Error('Preço mínimo não pode ser negativo.');
    }
  }

  const ordered = [...payload.tiers].sort((a, b) => a.min_area - b.min_area);

  ordered.forEach((tier, index) => {
    ensureFiniteNumber(tier.min_area, `Faixa ${index + 1} (mínimo)`);
    ensureFiniteNumber(tier.price_per_m2, `Faixa ${index + 1} (preço)`);

    if (tier.min_area < 0) {
      throw new Error(`Faixa ${index + 1}: valor mínimo não pode ser negativo.`);
    }

    if (tier.price_per_m2 < 0) {
      throw new Error(`Faixa ${index + 1}: preço não pode ser negativo.`);
    }

    if (tier.max_area !== null) {
      ensureFiniteNumber(tier.max_area, `Faixa ${index + 1} (máximo)`);
      if (tier.max_area <= tier.min_area) {
        throw new Error(`Faixa ${index + 1}: máximo deve ser maior que o mínimo.`);
      }
    }

    const next = ordered[index + 1];
    if (next && next.min_area < (tier.max_area ?? Number.POSITIVE_INFINITY)) {
      throw new Error(`Faixas sobrepostas entre os itens ${index + 1} e ${index + 2}.`);
    }
  });
};
