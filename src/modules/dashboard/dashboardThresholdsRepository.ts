import { supabase } from "@/lib/supabase";
import type { OperationalScope } from "./dashboardAdvanced";

export type PublishedThreshold = {
  scope: OperationalScope;
  attention_limit_minutes: number;
  critical_limit_minutes: number;
  calendar_version_id: string;
  revision: number;
  effective_from: string;
  updated_at: string;
  updated_by: string;
};
export type ThresholdHistory = {
  id: string;
  scope: OperationalScope;
  revision: number;
  previous_values: Record<string, unknown> | null;
  published_values: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
  reason: string;
};
export type ThresholdPreview = {
  scope: OperationalScope;
  os_consultadas: number;
  intervalos_candidatos: number;
  impacto_verificado: false;
  observacao: string;
};
export type ThresholdForm = {
  scope: OperationalScope;
  attentionMinutes: number;
  criticalMinutes: number;
  calendarVersionId: string;
};

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" ||
    /dashboard_operational_thresholds.*(not found|does not exist)/i.test(error.message ?? "")));
}

/**
 * A migration ainda não aplicada não é interpretada como configuração vazia.
 * A falta do schema suspende a análise de criticidade, preservando o Dashboard.
 */
export async function loadPublishedThresholds(): Promise<
  { state: "available"; rows: PublishedThreshold[] } | { state: "unavailable"; rows: [] }
> {
  const { data, error } = await supabase.from("dashboard_operational_thresholds")
    .select("scope,attention_limit_minutes,critical_limit_minutes,calendar_version_id,revision,effective_from,updated_at,updated_by");
  if (isMissingSchema(error)) return { state: "unavailable", rows: [] };
  if (error) throw new Error(error.message || "Não foi possível consultar os limites publicados.");
  return { state: "available", rows: (data ?? []) as PublishedThreshold[] };
}

export async function loadThresholdHistory(): Promise<ThresholdHistory[]> {
  const { data, error } = await supabase.from("dashboard_operational_threshold_revisions")
    .select("id,scope,revision,previous_values,published_values,changed_by,changed_at,reason")
    .order("changed_at", { ascending: false }).limit(200);
  if (isMissingSchema(error)) return [];
  if (error) throw new Error(error.message || "Não foi possível consultar o histórico dos limites.");
  return (data ?? []) as ThresholdHistory[];
}

export async function previewThresholds(input: ThresholdForm): Promise<ThresholdPreview> {
  const { data, error } = await supabase.rpc("dashboard_preview_thresholds", {
    p_scope: input.scope,
    p_attention_minutes: input.attentionMinutes,
    p_critical_minutes: input.criticalMinutes,
    p_calendar_version_id: input.calendarVersionId,
  });
  if (error) throw new Error(error.message || "Não foi possível consultar a prévia.");
  if (!data || typeof data !== "object") throw new Error("Prévia dos limites inválida.");
  return data as ThresholdPreview;
}

export async function publishThresholds(input: ThresholdForm & {
  expectedRevision: number;
  reason: string;
}): Promise<PublishedThreshold> {
  const { data, error } = await supabase.rpc("dashboard_publish_thresholds", {
    p_scope: input.scope,
    p_attention_minutes: input.attentionMinutes,
    p_critical_minutes: input.criticalMinutes,
    p_calendar_version_id: input.calendarVersionId,
    p_expected_revision: input.expectedRevision,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message || "Não foi possível publicar os limites.");
  if (!data || typeof data !== "object") throw new Error("Publicação dos limites sem confirmação.");
  return data as PublishedThreshold;
}
