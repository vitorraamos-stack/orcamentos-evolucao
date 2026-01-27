export interface Material {
  id: string;
  name: string;
  min_price: number;
  image_url: string | null;
  created_at?: string;
}

export interface PriceTier {
  id: string;
  material_id: string;
  min_area: number;
  max_area: number | null; // null means infinity
  price_per_m2: number;
}

export interface MaterialWithTiers extends Material {
  tiers: PriceTier[];
}
