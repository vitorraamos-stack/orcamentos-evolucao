export type TipoCalculo = 'm2' | 'linear';

export interface Material {
  id: string;
  name: string;
  description?: string | null;
  equivalence_message?: string | null;
  tipo_calculo?: TipoCalculo | null;
  min_price: number;
  image_url: string | null;
  created_at?: string;
}

export interface PriceTier {
  id: string;
  material_id: string;
  min_area: number;
  max_area: number | null; // null significa infinito
  price_per_m2: number;
  created_at?: string;
}

export interface MaterialWithTiers extends Material {
  tiers: PriceTier[];
}
