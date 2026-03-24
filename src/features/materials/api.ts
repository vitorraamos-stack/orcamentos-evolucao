import { supabase } from '@/lib/supabase';
import type { MaterialWithTiers } from '@/types/database';
import {
  type MaterialMutationInput,
  type MaterialTierInput,
  validateMaterialImage,
  validateMaterialPayload,
} from '@/features/materials/materialPayload';

const MATERIALS_BUCKET = 'materials';

const toNumeric = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export const fetchMaterialsWithTiers = async (): Promise<MaterialWithTiers[]> => {
  const { data, error } = await supabase
    .from('materials')
    .select('*, price_tiers(*)')
    .order('name')
    .order('min_area', { ascending: true, referencedTable: 'price_tiers' });

  if (error) throw error;

  return (data || []).map((material: any) => ({
    ...material,
    tiers: (material.price_tiers || []).map((tier: any) => ({
      ...tier,
      min_area: Number(tier.min_area),
      max_area: toNumeric(tier.max_area),
      price_per_m2: Number(tier.price_per_m2),
    })),
  }));
};

export const uploadMaterialImage = async (file: File, materialName: string) => {
  validateMaterialImage(file);

  const sanitizedName = materialName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${sanitizedName || 'material'}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: '3600',
  });

  if (error) throw error;

  const { data } = supabase.storage.from(MATERIALS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const normalizeTier = (tier: MaterialTierInput) => ({
  min_area: Number(tier.min_area),
  max_area: tier.max_area === null ? null : Number(tier.max_area),
  price_per_m2: Number(tier.price_per_m2),
});

export const upsertMaterialTransactional = async (payload: MaterialMutationInput) => {
  validateMaterialPayload(payload);

  const rpcPayload = {
    p_material_id: payload.material_id ?? null,
    p_name: payload.name.trim(),
    p_description: payload.description ?? null,
    p_equivalence_message: payload.equivalence_message ?? null,
    p_tipo_calculo: payload.tipo_calculo,
    p_min_price: payload.min_price,
    p_image_url: payload.image_url ?? null,
    p_tiers: payload.tiers.map(normalizeTier),
  };

  const { data, error } = await supabase.rpc('upsert_material_with_tiers', rpcPayload);

  if (error) throw error;
  return data;
};
