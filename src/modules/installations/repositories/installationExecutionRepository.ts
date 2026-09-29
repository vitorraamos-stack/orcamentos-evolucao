import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { loadHubUsersByIds } from "@/shared/repositories/hubUsersRepository";
import type {
  Installation,
  InstallationChecklistItem,
  InstallationEvidence,
  InstallationEvidencePhase,
} from "../types";
import {
  buildInstallationEvidencePath,
  prepareInstallationPhoto,
} from "../services/installationEvidence";

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};
export async function loadInstallationExecution(id: string) {
  const installationResult = await supabase
    .from("os_installations")
    .select("*")
    .eq("id", id)
    .single();
  fail(installationResult.error);
  const installation = installationResult.data as Installation;
  const [order, team, users, checklist, evidence] = await Promise.all([
    supabase
      .from("os_orders")
      .select(
        "id,sale_number,client_name,address,address_lat,address_lng,prod_status,logistic_type,archived,updated_at,delivery_date"
      )
      .eq("id", installation.os_id)
      .single(),
    installation.team_id
      ? supabase
          .from("os_installation_teams")
          .select("*")
          .eq("id", installation.team_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadHubUsersByIds(
      installation.responsible_id ? [installation.responsible_id] : []
    ),
    supabase
      .from("os_installation_checklist_items")
      .select("*")
      .eq("installation_id", id)
      .order("sort_order"),
    supabase
      .from("os_installation_evidence")
      .select(
        "*,asset:os_order_assets!os_installation_evidence_asset_id_fkey(object_path,original_name,mime_type,size_bytes)"
      )
      .eq("installation_id", id)
      .order("created_at"),
  ]);
  [order, team, checklist, evidence].forEach(result => fail(result.error));
  return {
    installation: {
      ...installation,
      order: order.data,
      team: team.data,
      responsible: users[0] ?? null,
    } as Installation,
    checklist: (checklist.data ?? []) as InstallationChecklistItem[],
    evidence: (evidence.data ?? []) as unknown as InstallationEvidence[],
  };
}
export async function setChecklistItem(
  id: string,
  status: string,
  note?: string | null
) {
  const { error } = await supabase.rpc(
    "hub_os_set_installation_checklist_item_secure",
    { p_item_id: id, p_status: status, p_note: note ?? null }
  );
  fail(error);
}
export async function saveCompletionNotes(id: string, notes: string) {
  const { error } = await supabase.rpc(
    "hub_os_update_installation_completion_notes_secure",
    { p_installation_id: id, p_notes: notes }
  );
  fail(error);
}
export async function forceCompleteInstallation(id: string, reason: string) {
  const { error } = await supabase.rpc(
    "hub_os_force_complete_installation_secure",
    { p_installation_id: id, p_reason: reason }
  );
  fail(error);
}
export async function getEvidencePreviewUrl(objectPath: string) {
  const data = await invokeEdgeFunction<{ downloadUrl: string }>(
    supabase,
    "r2-presign-download",
    { key: objectPath, forPreview: true }
  );
  return data.downloadUrl;
}
export async function uploadInstallationEvidence(
  installation: Installation,
  phase: InstallationEvidencePhase,
  input: File,
  note?: string
) {
  const file = await prepareInstallationPhoto(input);
  const key = buildInstallationEvidencePath(
    installation.os_id,
    installation.id,
    phase,
    file.name
  );
  const signed = await invokeEdgeFunction<{
    uploadUrl: string;
    publicKey: string;
    bucket: string;
  }>(supabase, "r2-presign-installation-evidence", {
    installationId: installation.id,
    phase,
    key,
    contentType: file.type,
    sizeBytes: file.size,
  });
  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok)
    throw new Error(
      "Não foi possível enviar a foto. Verifique sua conexão e tente novamente."
    );
  try {
    const { error } = await supabase.rpc(
      "hub_os_register_installation_evidence_secure",
      {
        p_installation_id: installation.id,
        p_phase: phase,
        p_object_path: signed.publicKey,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_storage_bucket: signed.bucket,
        p_r2_etag: put.headers.get("etag"),
        p_note: note ?? null,
      }
    );
    fail(error);
  } catch (error) {
    try {
      await invokeEdgeFunction(supabase, "r2-delete-objects", {
        keys: [signed.publicKey],
      });
    } catch (cleanupError) {
      console.error(
        "Falha no cleanup da evidência não registrada",
        cleanupError
      );
    }
    throw error;
  }
}
